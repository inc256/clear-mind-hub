import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CreditCard, Lock } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useUserProfile } from "@/store/userProfile";
import { toast } from "sonner";

// Map plan display names to database plan names
const planNameMapping: Record<string, string> = {
  'Free Trial': 'Free Trial',
  'Starter': 'Starter',
  'Standard': 'Standard',
  'Pro': 'Pro',
  'Pro+ Monthly': 'Pro+ Monthly',
  'Pro+ Yearly': 'Pro+ Yearly',
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
  const [loading, setLoading] = useState(false);
  const [cardNumber, setCardNumber] = useState('');
  const [expiry, setExpiry] = useState('');
  const [cvc, setCvc] = useState('');
  const [name, setName] = useState('');

  const handlePayment = async () => {
    if (!cardNumber || !expiry || !cvc || !name) {
      toast.error(t('payment.errors.missingFields'));
      return;
    }

    setLoading(true);
    try {
      // TODO: Integrate with actual payment processor (Stripe, PayPal, etc.)
      // For now, simulate payment processing
      console.log('Processing payment:', {
        planName,
        price,
        credits,
        billingPeriod,
        cardNumber: cardNumber.replace(/\d(?=\d{4})/g, '*'),
        expiry,
        cvc: '***',
        name,
      });

      // Simulate payment processing delay
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Determine plan type and update user profile accordingly
      const planId = getPlanIdFromName(planName);

      let success = false;
      const dbPlanName = planNameMapping[planName];

      if (dbPlanName) {
        // Apply the plan using the database function
        success = await applyPlan(dbPlanName);
        if (success) {
          if (dbPlanName === 'Free Trial') {
            toast.success(t('payment.success.trial', { plan: planName }));
          } else if (dbPlanName.includes('Monthly') || dbPlanName.includes('Yearly')) {
            toast.success(t('payment.success.subscription', { plan: planName }));
          } else {
            toast.success(t('payment.success.credits', { credits }));
          }
        }
      } else {
        // Fallback for direct credit purchases
        success = await purchaseCredits(credits);
        if (success) {
          toast.success(t('payment.success.credits', { credits }));
        }
      }

      if (!success) {
        throw new Error('Failed to update user profile');
      }

      // Close modal
      onClose();

      // Clear form
      setCardNumber('');
      setExpiry('');
      setCvc('');
      setName('');

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
          </div>

          {/* Payment Form */}
          <div className="space-y-4">
            <div>
              <Label htmlFor="name">{t('payment.cardName')}</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('payment.cardNamePlaceholder')}
              />
            </div>

            <div>
              <Label htmlFor="cardNumber">{t('payment.cardNumber')}</Label>
              <Input
                id="cardNumber"
                value={cardNumber}
                onChange={(e) => setCardNumber(formatCardNumber(e.target.value))}
                placeholder="1234 5678 9012 3456"
                maxLength={19}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="expiry">{t('payment.expiry')}</Label>
                <Input
                  id="expiry"
                  value={expiry}
                  onChange={(e) => setExpiry(formatExpiry(e.target.value))}
                  placeholder="MM/YY"
                  maxLength={5}
                />
              </div>
              <div>
                <Label htmlFor="cvc">{t('payment.cvc')}</Label>
                <Input
                  id="cvc"
                  value={cvc}
                  onChange={(e) => setCvc(e.target.value.replace(/[^0-9]/g, ''))}
                  placeholder="123"
                  maxLength={4}
                />
              </div>
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