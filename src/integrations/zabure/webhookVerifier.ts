import {
  ZabureWebhookPayload,
  WebhookVerificationResult,
} from "./webhookTypes";

const SIGNATURE_HEADER = "x-zabure-signature";
const TIMESTAMP_HEADER = "x-zabure-timestamp";

/** Replay-attack window: reject events older than this (ms) */
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

export async function verifyZabureWebhook(
  rawBody: string,
  headers: Headers | Record<string, string>,
  secret: string
): Promise<WebhookVerificationResult> {
  const get = (key: string) =>
    headers instanceof Headers ? headers.get(key) : headers[key];

  const signature = get(SIGNATURE_HEADER);
  if (!signature) {
    return { valid: false, reason: `Missing header: ${SIGNATURE_HEADER}` };
  }

  const timestamp = get(TIMESTAMP_HEADER);
  if (!timestamp) {
    return { valid: false, reason: `Missing header: ${TIMESTAMP_HEADER}` };
  }

  const eventTime = new Date(timestamp).getTime();
  if (isNaN(eventTime) || Date.now() - eventTime > MAX_AGE_MS) {
    return { valid: false, reason: "Webhook timestamp is too old or invalid" };
  }

  const [algo, receivedHex] = (signature as string).split("=", 2);
  if (algo !== "sha256" || !receivedHex) {
    return { valid: false, reason: "Unexpected signature format" };
  }

  const signedPayload = `${timestamp}.${rawBody}`;
  const expectedHex = await hmacSha256Hex(secret, signedPayload);

  if (!safeEqual(expectedHex, receivedHex)) {
    return { valid: false, reason: "Signature mismatch" };
  }

  return { valid: true };
}

export async function parseZabureWebhook(
  rawBody: string,
  headers: Headers | Record<string, string>,
  secret: string
): Promise<ZabureWebhookPayload> {
  const result = await verifyZabureWebhook(rawBody, headers, secret);
  if (!result.valid) {
    throw new Error(`Invalid Zabure webhook: ${result.reason}`);
  }
  return JSON.parse(rawBody) as ZabureWebhookPayload;
}
