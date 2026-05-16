import { parseZabureWebhook } from "../integrations/zabure/webhookVerifier";
import { handleZabureWebhook } from "../integrations/zabure/webhookHandler";
import { supabase } from "../integrations/supabase/client";
import type { ZabureWebhookPayload } from "../integrations/zabure/webhookTypes";

const ZABURE_WEBHOOK_SECRET = import.meta.env.VITE_ZABURE_WEBHOOK_SECRET as string;

/**
 * Process a raw webhook request from Zabure.
 * Verifies signature, records the transaction (idempotent) and
 * routes to business logic handlers (which are safe/idempotent).
 *
 * Expects Zabure transaction.metadata to include at least `userId` and
 * optionally `planName` when the webhook should trigger a subscription change.
 */
export async function processZabureWebhook(
  rawBody: string,
  headers: Headers | Record<string, string>
) {
  if (!ZABURE_WEBHOOK_SECRET) {
    throw new Error("Missing VITE_ZABURE_WEBHOOK_SECRET environment variable");
  }

  const payload: ZabureWebhookPayload = await parseZabureWebhook(
    rawBody,
    headers,
    ZABURE_WEBHOOK_SECRET
  );

  const tx = payload.data;

  // Idempotency: ensure we only process each external transaction once
  const { data: existing } = await supabase
    .from("zabure_transactions")
    .select("id")
    .eq("id", tx.id)
    .limit(1)
    .maybeSingle();

  if (existing) {
    // already processed
    return { status: "skipped", reason: "already_processed" };
  }

  // Record the external transaction for audit / idempotency
  const metadata = tx.metadata ?? {};

  await supabase.from("zabure_transactions").insert({
    id: tx.id,
    event: payload.event,
    amount: tx.amount,
    currency: tx.currency,
    status: tx.status,
    user_id: metadata.userId ?? null,
    plan_name: metadata.planName ?? null,
    raw: payload,
  });

  // If this is a successful payment and metadata includes a planName and userId,
  // apply the plan using the database RPC `apply_plan` which already exists.
  if (payload.event === "payment.success") {
    const userId = metadata.userId as string | undefined;
    const planName = metadata.planName as string | undefined;

    if (userId && planName) {
      // call the DB function to apply the plan (handles trial/one_time/subscription)
      const { error } = await supabase.rpc("apply_plan", {
        p_user_id: userId,
        p_plan_name: planName,
      });

      if (error) {
        console.error("Failed to apply plan via RPC:", error);
        // still return processed, but include error for operator review
        return { status: "processed", applied: false, error: error.message };
      }
      return { status: "processed", applied: true };
    }
  }

  // For other events, just route to business logic handlers (logging, notifications)
  await handleZabureWebhook(payload);

  return { status: "processed", applied: false };
}
