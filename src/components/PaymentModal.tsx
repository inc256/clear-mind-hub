import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Lock, CreditCard } from "lucide-react";
import { createZabureClient } from "@/integrations/zabure/zabureClient";
import { supabase } from '@/integrations/supabase/client';
import { useTranslation } from "react-i18next";
import { useUserProfile } from "@/store/userProfile";
import { toast } from "sonner";

// Map plan display names to database plan names
const planNameMapping: Record<string, string> = {
  'Free Trial': 'Free Trial',
  'Trial': 'Trial',
  'Starter': 'Basic',
  'Standard': 'Basic',
  'Basic': 'Basic',
  'Pro': 'Pro',
  'Ultra': 'Ultra',
  'Pro+ Monthly': 'Pro',
  'Pro+ Yearly': 'Pro',
};

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  planName: string;
  price: number;
  credits: number;
  billingPeriod: 'monthly' | 'yearly';
}

export function PaymentModal({ isOpen, onClose, planName, price, credits, billingPeriod }: PaymentModalProps) {
  const { t } = useTranslation();
  const { applyPlan, purchaseCredits } = useUserProfile();
  const { profile } = useUserProfile();
  const [loading, setLoading] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [operator, setOperator] = useState<'MTN'|'Airtel'>('MTN');
  const [rate, setRate] = useState<number | null>(null);
  const [rateLoading, setRateLoading] = useState(false);
  const [rateIsFallback, setRateIsFallback] = useState(false);
  const DEFAULT_RATE = Number(import.meta.env.VITE_USD_TO_UGX_RATE || 3800);

  const handlePayment = async () => {
    if (!phoneNumber) {
      toast.error(t('payment.errors.missingPhone'));
      return;
    }

    // compute UGX equivalent (use live rate, env fallback, or DEFAULT_RATE)
    const envRate = parseFloat(String(import.meta.env.VITE_USD_TO_UGX_RATE || '0')) || 0;
    const usedRate = rate ?? envRate ?? DEFAULT_RATE;
    if (!rate && !envRate) {
      toast.warning(`Using fallback exchange rate ${DEFAULT_RATE} UGX / USD`);
    }

    const ugxAmount = Math.round(price * usedRate);

    setLoading(true);
    try {
      const supabaseBase = import.meta.env.VITE_SUPABASE_URL as string;
      // prefer the user's session access token so Supabase Function receives an auth header
      let token = import.meta.env.VITE_SUPABASE_FUNCTIONS_KEY as string | undefined;
      try {
        const { data } = await supabase.auth.getSession();
        const sessionToken = data?.session?.access_token;
        if (sessionToken) token = sessionToken;
      } catch (e) {
        console.warn('Failed to read supabase session token', e);
      }

      const client = createZabureClient(supabaseBase, token);

      const dbPlanName = planNameMapping[planName] || planName;

      const metadata: Record<string,string> = {};
      if (profile?.id) metadata.userId = profile.id;
      metadata.planName = dbPlanName;

      const payload = {
        amount: ugxAmount,
        currency: 'UGX',
        phoneNumber: formatLocalPhone(phoneNumber),
        description: `Purchase ${planName}`,
        operator: operator.toLowerCase(),
        metadata,
      };

      const res = await client.collect(payload as any);

      console.debug('[PaymentModal] zabure collect response', res);

      toast.success(t('payment.success.initiated'));
      onClose();
    } catch (error: any) {
      console.error('Payment failed:', error);
      toast.error(error?.message || t('payment.errors.failed'));
    } finally {
      setLoading(false);
    }
  };

  const getPlanIdFromName = (planName: string): string => {
    const planMapping: Record<string, string> = {
      'Free Trial': 'free-trial',
      'Starter': 'starter',
      'Standard': 'standard',
      'Pro': 'pro',
      'Pro+ Monthly': 'pro-monthly',
      'Pro+ Yearly': 'pro-yearly',
    };
    return planMapping[planName] || 'starter';
  };

  const formatCardNumber = (value: string) => {
    const v = value.replace(/\s+/g, '').replace(/[^0-9]/gi, '');
    const matches = v.match(/\d{4,16}/g);
    const match = matches && matches[0] || '';
    const parts = [];
    for (let i = 0, len = match.length; i < len; i += 4) {
      parts.push(match.substring(i, i + 4));
    }
    if (parts.length) {
      return parts.join(' ');
    } else {
      return v;
    }
  };

  const formatExpiry = (value: string) => {
    const v = value.replace(/\s+/g, '').replace(/[^0-9]/gi, '');
    if (v.length >= 2) {
      return v.substring(0, 2) + '/' + v.substring(2, 4);
    }
    return v;
  };

  const formatLocalPhone = (value: string) => {
    // normalize to E.164 for Uganda (country code 256)
    const digits = value.replace(/[^0-9]/g, '');
    if (digits.startsWith('0')) {
      return '256' + digits.substring(1);
    }
    if (digits.startsWith('7') || digits.startsWith('3') || digits.startsWith('2')) {
      return '256' + digits;
    }
    if (digits.startsWith('256')) return digits;
    return digits;
  };

  // Fetch USD -> UGX rate when modal opens
  useEffect(() => {
    let mounted = true;
    async function fetchRate() {
      setRateLoading(true);
      try {
        const envRate = parseFloat(String(import.meta.env.VITE_USD_TO_UGX_RATE || '0')) || 0;
        if (envRate) {
          if (mounted) {
            setRate(envRate);
            setRateIsFallback(false);
          }
          return;
        }

        try {
          const r = await fetch('https://api.exchangerate.host/latest?base=USD&symbols=UGX');
          const json = await r.json();
          const fetched = Number(json?.rates?.UGX) || null;
          if (fetched && mounted) {
            setRate(fetched);
            setRateIsFallback(false);
            return;
          }
        } catch (err) {
          console.warn('Exchange rate fetch failed:', err);
        }

        // fallback default
        if (mounted) {
          setRate(DEFAULT_RATE);
          setRateIsFallback(true);
        }
      } catch (e) {
        console.warn('Failed to fetch exchange rate', e);
      } finally {
        if (mounted) setRateLoading(false);
      }
    }
    if (isOpen) fetchRate();
    return () => { mounted = false; };
  }, [isOpen]);

  // Optional: expose a simple converter component in modal footer for debugging
  // import dynamically to avoid increasing bundle for all users
  const showConverter = false;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CreditCard className="w-5 h-5" />
            {t('payment.title')}
          </DialogTitle>
          <DialogDescription>
            {t('payment.description', { plan: planName, price: `$${price}`, period: billingPeriod })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Plan Summary */}
          <div className="bg-muted/50 p-4 rounded-lg">
            <div className="flex justify-between items-center">
              <span className="font-medium">{planName}</span>
              <span className="font-bold">${price}</span>
            </div>
            <div className="text-sm text-muted-foreground mt-1">
              {credits} {t('subscription.credits')} • {billingPeriod === 'monthly' ? t('subscription.billing.monthly') : t('subscription.billing.yearly')}
            </div>
            <div className="text-sm text-muted-foreground mt-2">
              {rateLoading ? t('payment.rateLoading') : (
                rate ? (
                  <>
                    {new Intl.NumberFormat('en-US').format(Math.round(price * rate))} UGX • 1 USD = {new Intl.NumberFormat('en-US').format(rate)} UGX{rateIsFallback ? t('payment.rateFallbackSuffix') : ''}
                  </>
                ) : (
                  <> {t('payment.rateUnavailable')} </>
                )
              )}
            </div>
          </div>

          {/* Mobile Money Form */}
          <div className="space-y-4">
            <div>
              <Label htmlFor="operator">{t('payment.operator')}</Label>
              <Select onValueChange={(v) => setOperator(v === 'MTN' ? 'MTN' : 'Airtel')} value={operator}>
                <SelectTrigger>
                  <SelectValue placeholder={t('payment.chooseOperator')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="MTN">{t('payment.operatorMtn')}</SelectItem>
                  <SelectItem value="Airtel">{t('payment.operatorAirtel')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="phone">{t('payment.phoneNumber')}</Label>
              <Input
                id="phone"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                placeholder={t('payment.phonePlaceholder')}
              />
            </div>

            <div className="text-sm text-muted-foreground">
              {t('payment.mobileMoneyNotice', { operator })}
            </div>
          </div>

          {/* Security Notice */}
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Lock className="w-4 h-4" />
            {t('payment.secure')}
          </div>
        </div>

        <DialogFooter className="flex gap-2">
          <Button variant="outline" onClick={onClose} disabled={loading}>
            {t('common.cancel')}
          </Button>
          <Button onClick={handlePayment} disabled={loading}>
            {loading ? t('payment.processing') : t('payment.pay', { amount: `$${price}` })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}