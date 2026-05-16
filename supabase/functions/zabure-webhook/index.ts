import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

type ZabureCurrency = "UGX" | "KES" | "TZS" | "USD";
type ZabureTransactionStatus = "PENDING" | "PROCESSING" | "SUCCESS" | "FAILED" | "CANCELLED";
type ZabureWebhookEventType =
  | "payment.success"
  | "payment.failed"
  | "payment.pending"
  | "payment.cancelled"
  | "payout.success"
  | "payout.failed"
  | "payout.pending"
  | "payout.cancelled";

interface ZabureWebhookTransaction {
  id: string;
  externalReference: string;
  amount: number;
  currency: ZabureCurrency;
  status: ZabureTransactionStatus;
  phoneNumber?: string;
  description?: string;
  customerName?: string;
  metadata?: Record<string, string>;
  createdAt: string;
  updatedAt?: string;
}

interface ZabureWebhookPayload {
  event: ZabureWebhookEventType;
  timestamp: string;
  data: ZabureWebhookTransaction;
}

const MAX_AGE_MS = 5 * 60 * 1_000; // 5 minutes

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}

async function verifyAndParse(rawBody: string, headers: Headers, secret: string): Promise<ZabureWebhookPayload> {
  const signature = headers.get("x-zabure-signature");
  if (!signature) throw new Error("Missing header: x-zabure-signature");

  const timestamp = headers.get("x-zabure-timestamp");
  if (!timestamp) throw new Error("Missing header: x-zabure-timestamp");

  const eventTime = new Date(timestamp).getTime();
  if (isNaN(eventTime) || Date.now() - eventTime > MAX_AGE_MS) {
    throw new Error("Webhook timestamp is too old or invalid");
  }

  const [algo, receivedHex] = signature.split("=", 2);
  if (algo !== "sha256" || !receivedHex) throw new Error("Unexpected signature format");

  const expectedHex = await hmacSha256Hex(secret, `${timestamp}.${rawBody}`);
  if (!safeEqual(expectedHex, receivedHex)) throw new Error("Signature mismatch");

  return JSON.parse(rawBody) as ZabureWebhookPayload;
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE") || "";
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  global: { headers: { "Authorization": `Bearer ${SERVICE_ROLE_KEY}` } }
});

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type,X-Zabure-Signature,X-Zabure-Timestamp",
    }});
  }

  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let rawBody: string;
  try {
    rawBody = await req.text();
  } catch {
    return json({ error: "Failed to read request body" }, 400);
  }

  const secret = Deno.env.get("ZABURE_WEBHOOK_SECRET");
  if (!secret) {
    console.error("[Zabure] ZABURE_WEBHOOK_SECRET is not set");
    return json({ error: "Webhook secret not configured" }, 500);
  }

  let payload: ZabureWebhookPayload;
  try {
    payload = await verifyAndParse(rawBody, req.headers, secret);
  } catch (err: any) {
    console.warn("[Zabure] Verification failed:", err?.message);
    return json({ error: "Invalid webhook signature" }, 401);
  }

  // Upsert zabure_transactions for idempotency/audit
  const tx = payload.data;
  try {
    // Try insert, if conflict update status and raw
    await supabase.from('zabure_transactions').upsert({
      id: tx.id,
      event: payload.event,
      amount: tx.amount,
      currency: tx.currency,
      status: tx.status,
      user_id: tx.metadata?.userId ?? null,
      plan_name: tx.metadata?.planName ?? null,
      raw: payload,
      created_at: new Date().toISOString()
    }, { onConflict: 'id' });
  } catch (e) {
    console.warn('[zabure-webhook] failed to record transaction', e);
  }

  // Route events
  try {
    if (payload.event === 'payment.success') {
      // Apply plan if metadata supplies userId + planName
      const userId = tx.metadata?.userId;
      const planName = tx.metadata?.planName;
      if (userId && planName) {
        const { error } = await supabase.rpc('apply_plan', { p_user_id: userId, p_plan_name: planName });
        if (error) {
          console.error('[zabure-webhook] apply_plan rpc error', error);
          // Return 500 to allow Zulabure to retry if desired
          return json({ error: 'Failed to apply plan' }, 500);
        }
      }
    }

    // You can add more event-specific business logic here
  } catch (e) {
    console.error('[zabure-webhook] handler error', e);
    return json({ error: 'Handler error' }, 500);
  }

  return json({ received: true });
});
