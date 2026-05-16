import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

type ZabureEnv = "sandbox" | "production";

const BASE_URLS: Record<ZabureEnv, string> = {
  sandbox: "https://sandbox.zabure.com",
  production: "https://pay.zabure.com",
};

function getBaseUrl(): string {
  const env = (Deno.env.get("ZABURE_ENV") ?? "sandbox") as ZabureEnv;
  return BASE_URLS[env] ?? BASE_URLS.sandbox;
}

function getApiKey(): string {
  const key = Deno.env.get("ZABURE_API_KEY");
  if (!key) throw new Error("ZABURE_API_KEY is not set");
  return key;
}

function buildCorsHeaders(origin?: string) {
  const allowedOrigin = origin || "*";
  return {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
    "Access-Control-Allow-Credentials": "true",
  } as Record<string,string>;
}

function json(body: unknown, status = 200, origin?: string): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: buildCorsHeaders(origin),
  });
}

async function proxyToZabure(
  zabureEndpoint: string,
  requestBody: unknown,
  requiresAuth: boolean
): Promise<{ status: number; data: any }>
{
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  if (requiresAuth) headers["X-API-Key"] = getApiKey();

  const upstream = await fetch(`${getBaseUrl()}${zabureEndpoint}`, {
    method: "POST",
    headers,
    body: JSON.stringify(requestBody),
  });

  const data = await upstream.json().catch(() => ({}));
  return { status: upstream.status, data };
}

const ROUTES: Record<string, { zabureEndpoint: string; requiresAuth: boolean }> = {
  "/collect":        { zabureEndpoint: "/api/v1/payments/collect",        requiresAuth: true  },
  "/send":           { zabureEndpoint: "/api/v1/payments/send",           requiresAuth: true  },
  "/validate-phone": { zabureEndpoint: "/api/v1/payments/validate-phone", requiresAuth: false },
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE") || "";
if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.warn("Supabase URL or service role key not configured in function environment");
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  global: { headers: { "Authorization": `Bearer ${SERVICE_ROLE_KEY}` } }
});

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    const origin = req.headers.get('origin') || '*';
    return new Response(null, { status: 204, headers: buildCorsHeaders(origin) });
  }

  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405, req.headers.get('origin') || '*');

  const url = new URL(req.url);
  const subPath = url.pathname.replace(/^.*\/zabure-payments/, "") || "/";
  const route = ROUTES[subPath];
  if (!route) return json({ error: "Unknown route", available: Object.keys(ROUTES) }, 404);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  try {
    const { status, data } = await proxyToZabure(route.zabureEndpoint, body, route.requiresAuth);

    // If Zabure returned a transaction id, persist an initial record for idempotency/audit
    const txId = data?.id || data?.transaction_id || null;
    const metadata = (body && body.metadata) || {};

    if (txId && SUPABASE_URL && SERVICE_ROLE_KEY) {
      try {
        await supabase.from('zabure_transactions').insert({
          id: txId,
          event: 'collect.initiated',
          amount: data?.amount ?? body?.amount ?? null,
          currency: data?.currency ?? body?.currency ?? null,
          status: data?.status ?? null,
          user_id: metadata?.userId ?? null,
          plan_name: metadata?.planName ?? null,
          raw: data ?? body,
        });
      } catch (e) {
        console.warn('[zabure-payments] failed to record transaction', e);
      }
    }
    return json(data, status, req.headers.get('origin') || '*');
  } catch (err) {
    console.error('[zabure-payments] Error:', err);
    return json({ error: 'Internal error' }, 500, req.headers.get('origin') || '*');
  }
});
