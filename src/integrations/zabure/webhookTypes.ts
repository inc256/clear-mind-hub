// Zabure Webhook – TypeScript types

export type ZabureCurrency = "UGX" | "USD" | "EUR" | string;
export type ZabureTransactionStatus =
  | "success"
  | "failed"
  | "pending"
  | "cancelled"
  | string;

/** All known Zabure webhook event types */
export type ZabureWebhookEventType =
  | "payment.success"
  | "payment.failed"
  | "payment.pending"
  | "payment.cancelled"
  | "payout.success"
  | "payout.failed"
  | "payout.pending"
  | "payout.cancelled";

export interface ZabureWebhookTransaction {
  id: string;
  externalReference: string;
  amount: number;
  currency: ZabureCurrency;
  status: ZabureTransactionStatus;
  phoneNumber?: string;
  description?: string;
  customerName?: string;
  metadata?: Record<string, string>;
  createdAt: string; // ISO 8601
  updatedAt?: string; // ISO 8601
}

export interface ZabureWebhookPayload {
  event: ZabureWebhookEventType;
  timestamp: string; // ISO 8601
  data: ZabureWebhookTransaction;
}

export interface WebhookVerificationResult {
  valid: boolean;
  reason?: string;
}
