import { useState, useEffect } from 'react';
import axios from 'axios';

type RatesMap = Record<string, number>;

/**
 * Lightweight currency rates hook.
 * Fetches rates (base -> others) and exposes `convert` helper.
 * Falls back to providedEnvRate or a sensible default if fetch fails.
 */
export function useCurrency(baseCurrency = 'USD', opts?: { envRate?: number }) {
  const [rates, setRates] = useState<RatesMap>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    async function fetchRates() {
      setLoading(true);
      setError(null);
      try {
        // Use exchangerate.host -- no API key required and reliable for basic usage
        const res = await axios.get(`https://api.exchangerate.host/latest`, {
          params: { base: baseCurrency }
        });
        if (!mounted) return;
        const fetched: RatesMap = res.data?.rates || {};
        setRates(fetched);
      } catch (err: any) {
        console.warn('[useCurrency] fetch failed', err?.message || err);
        setError(String(err?.message || 'Failed to fetch rates'));
        // leave rates empty; consumer should use fallback
      } finally {
        if (mounted) setLoading(false);
      }
    }

    fetchRates();
    const interval = setInterval(fetchRates, 1000 * 60 * 30); // refresh every 30m
    return () => { mounted = false; clearInterval(interval); };
  }, [baseCurrency]);

  function convert(amount: number, toCurrency: string): number | null {
    if (toCurrency === baseCurrency) return amount;
    const rate = rates[toCurrency];
    if (typeof rate === 'number') return amount * rate;
    // fallback to env-provided or null
    if (opts?.envRate) return amount * opts.envRate;
    return null;
  }

  return { rates, convert, loading, error } as const;
}
