type ZabureCollectPayload = {
  amount: number;
  currency: string;
  phoneNumber: string;
  description?: string;
  metadata?: Record<string, string>;
};

type ZabureSendPayload = ZabureCollectPayload & { /* extend if needed */ };

type ZabureValidatePhonePayload = { phoneNumber: string };

/**
 * Minimal client to call the Supabase Edge Function proxy for Zabure.
 *
 * @param supabaseBase Base URL of your Supabase project e.g. https://<ref>.supabase.co
 * @param token Optional bearer token for authenticated function calls
 */
export function createZabureClient(supabaseBase: string, token?: string) {
  if (!supabaseBase) throw new Error("supabaseBase is required");

  async function call(path: string, body: unknown, opts?: { auth?: boolean }) {
    const url = `${supabaseBase.replace(/\/$/, "")}/functions/v1/zabure-payments/${path}`;
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (opts?.auth && token) headers["Authorization"] = `Bearer ${token}`;

    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body ?? {}),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Zabure function error ${res.status}: ${text}`);
    }
    return res.json();
  }

  return {
    collect: (payload: ZabureCollectPayload) => call("collect", payload, { auth: true }),
    send: (payload: ZabureSendPayload) => call("send", payload, { auth: true }),
    validatePhone: (payload: ZabureValidatePhonePayload) => call("validate-phone", payload, { auth: false }),
  };
}

export type { ZabureCollectPayload };
