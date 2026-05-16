import React, { useState } from 'react';
import { useCurrency } from '@/hooks/useCurrency';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export default function CurrencyConverter({ base = 'USD' }: { base?: string }) {
  const [amount, setAmount] = useState<number>(1);
  const [toCurrency, setToCurrency] = useState<string>('UGX');
  const { convert, rates, loading } = useCurrency(base, { envRate: Number(import.meta.env.VITE_USD_TO_UGX_RATE || 3800) });

  const result = convert(amount, toCurrency);

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Input type="number" value={String(amount)} onChange={(e) => setAmount(Number(e.target.value || 0))} />
        <Select value={toCurrency} onValueChange={(v) => setToCurrency(v)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {Object.keys(rates).slice(0,50).map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            <SelectItem value="UGX">UGX</SelectItem>
            <SelectItem value="EUR">EUR</SelectItem>
            <SelectItem value="GBP">GBP</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div>
        {loading ? 'Loading rates...' : (
          <div>{amount} {base} = {result !== null ? Number(result).toFixed(2) : 'N/A'} {toCurrency}</div>
        )}
      </div>
    </div>
  );
}
