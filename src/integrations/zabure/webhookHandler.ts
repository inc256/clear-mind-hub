import {
  ZabureWebhookPayload,
  ZabureWebhookTransaction,
  ZabureWebhookEventType,
} from "./webhookTypes";

// ── Individual event handlers ─────────────────

async function onPaymentSuccess(tx: ZabureWebhookTransaction): Promise<void> {
  console.log(
    `[Zabure] Payment SUCCESS  id=${tx.id}  amount=${tx.amount} ${tx.currency}`
  );
  // TODO: Mark order as paid in your database
}

async function onPaymentFailed(tx: ZabureWebhookTransaction): Promise<void> {
  console.warn(
    `[Zabure] Payment FAILED   id=${tx.id}  amount=${tx.amount} ${tx.currency}`
  );
  // TODO: Notify customer of failed payment
}

async function onPaymentPending(tx: ZabureWebhookTransaction): Promise<void> {
  console.log(`[Zabure] Payment PENDING  id=${tx.id}`);
}

async function onPaymentCancelled(tx: ZabureWebhookTransaction): Promise<void> {
  console.log(`[Zabure] Payment CANCELLED id=${tx.id}`);
}

async function onPayoutSuccess(tx: ZabureWebhookTransaction): Promise<void> {
  console.log(
    `[Zabure] Payout SUCCESS   id=${tx.id}  amount=${tx.amount} ${tx.currency}`
  );
}

async function onPayoutFailed(tx: ZabureWebhookTransaction): Promise<void> {
  console.warn(`[Zabure] Payout FAILED    id=${tx.id}`);
}

async function onPayoutPending(tx: ZabureWebhookTransaction): Promise<void> {
  console.log(`[Zabure] Payout PENDING   id=${tx.id}`);
}

async function onPayoutCancelled(tx: ZabureWebhookTransaction): Promise<void> {
  console.log(`[Zabure] Payout CANCELLED id=${tx.id}`);
}

const handlers: Record<
  ZabureWebhookEventType,
  (tx: ZabureWebhookTransaction) => Promise<void>
> = {
  "payment.success": onPaymentSuccess,
  "payment.failed": onPaymentFailed,
  "payment.pending": onPaymentPending,
  "payment.cancelled": onPaymentCancelled,
  "payout.success": onPayoutSuccess,
  "payout.failed": onPayoutFailed,
  "payout.pending": onPayoutPending,
  "payout.cancelled": onPayoutCancelled,
};

export async function handleZabureWebhook(
  payload: ZabureWebhookPayload
): Promise<void> {
  const handler = handlers[payload.event];

  if (!handler) {
    console.warn(`[Zabure] Unknown event type received: ${payload.event}`);
    return;
  }

  await handler(payload.data);
}
