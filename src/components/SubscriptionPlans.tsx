import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Check, Zap, Crown, Star } from "lucide-react";
import { useTranslation } from "react-i18next";
import { PaymentModal } from "./PaymentModal";

interface Plan {
  id: string;
  name: string;
  description: string;
  price: number;
  period: string;
  credits: number;
  features: string[];
  popular?: boolean;
  icon: React.ReactNode;
  billingPeriod?: string;
  tagline?: string;
}

export function SubscriptionPlans() {
  const { t } = useTranslation();
  const [paymentModal, setPaymentModal] = useState<{
    isOpen: boolean;
    plan: Plan | null;
  }>({ isOpen: false, plan: null });

  const plans: Plan[] = [
    {
      id: 'free-trial',
      name: "Free Trial",
      description: "Full access, no limits",
      price: 0,
      period: "30 days",
      credits: 999999, // Unlimited for trial
      features: [
        "Unlimited credits for 30 days",
        "Full problem-solving flow",
        "Full research access",
        "10 Credits Daily",
      ],
      icon: <Zap className="w-6 h-6" />,
    },
    {
      id: 'starter',
      name: "Starter",
      description: "50 Credits",
      price: 1.36,
      period: "one-time",
      credits: 50,
      features: [
        "50 AI credits",
        "Solve multiple problems",
        "Basic research tools",
        "Fast responses",
      ],
      icon: <Star className="w-6 h-6" />,
    },
    {
      id: 'standard',
      name: "Standard",
      description: "150 Credits",
      price: 3.26,
      period: "one-time",
      credits: 150,
      features: [
        "150 AI credits",
        "Full problem-solving flow",
        "Structured research tools",
        "Priority responses",
      ],
      popular: true,
      icon: <Crown className="w-6 h-6" />,
    },
    {
      id: 'pro',
      name: "Pro",
      description: "500 Credits",
      price: 8.14,
      period: "one-time",
      credits: 500,
      features: [
        "500 AI credits",
        "Advanced research & analysis",
        "Generate full reports",
        "Export (PDF, Docs)",
      ],
      icon: <Crown className="w-6 h-6" />,
    },
    {
      id: 'pro-monthly',
      name: "Pro+ Monthly",
      description: "300 Credits Monthly",
      price: 4.07,
      period: "/ month",
      credits: 300,
      features: [
        "300 credits every month",
        "Best for regular users",
        "Priority processing",
        "All platforms",
      ],
      icon: <Crown className="w-6 h-6" />,
    },
    {
      id: 'pro-yearly',
      name: "Pro+ Yearly",
      description: "Best Value",
      price: 32.55,
      period: "/ year",
      credits: 300, // 300 per month, billed yearly
      features: [
        "300 credits/month (billed yearly)",
        "Save more vs monthly",
        "Priority support",
        "Early access to features",
      ],
      icon: <Crown className="w-6 h-6" />,
    },
  ];

  const handleSubscribe = (planId: string) => {
    const plan = plans.find(p => p.id === planId);
    if (plan && plan.id !== 'free-trial') {
      const billingPeriod = plan.id === 'pro-yearly' ? 'yearly' : 'monthly';
      setPaymentModal({ isOpen: true, plan: { ...plan, billingPeriod } });
    }
  };

  const handlePaymentClose = () => {
    setPaymentModal({ isOpen: false, plan: null });
  };

  return (
    <div className="space-y-6">

      {/* Plans Grid */}
      <div className="grid gap-6 md:grid-cols-3">
        {plans.map((plan) => (
          <Card
            key={plan.id}
            className={`relative ${plan.popular ? 'border-primary shadow-lg' : ''}`}
          >
            {plan.popular && (
              <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                <Badge className="bg-primary text-primary-foreground">
                  {t('subscription.plans.popular')}
                </Badge>
              </div>
            )}

            <CardHeader className="text-center pb-4">
              <div className="mx-auto w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center text-primary mb-4">
                {plan.icon}
              </div>
              <CardTitle className="text-xl">{plan.name}</CardTitle>
              <CardDescription>{plan.description}</CardDescription>
            </CardHeader>

            <CardContent className="space-y-4">
              <div className="text-center">
                <div className="text-3xl font-bold">
                  {plan.price === 0 ? 'Free' : `$${plan.price}`}
                  {plan.period !== 'one-time' && plan.period !== '7 days' && (
                    <span className="text-lg font-normal text-muted-foreground">
                      {plan.period}
                    </span>
                  )}
                </div>
                <div className="text-sm text-muted-foreground mt-1">
                  {plan.credits === 999999 ? 'Unlimited credits' : `${plan.credits} credits`}
                  {plan.period === '7 days' && ' for 7 days'}
                </div>
                {plan.tagline && (
                  <div className="text-xs text-muted-foreground mt-1">
                    {plan.tagline}
                  </div>
                )}
              </div>

              <ul className="space-y-2">
                {plan.features.map((feature, index) => (
                  <li key={index} className="flex items-center text-sm">
                    <Check className="w-4 h-4 text-green-500 mr-2 flex-shrink-0" />
                    {feature}
                  </li>
                ))}
              </ul>
            </CardContent>

            <CardFooter>
              <Button
                className="w-full"
                variant={plan.id === 'free-trial' ? 'outline' : plan.popular ? 'default' : 'secondary'}
                onClick={() => handleSubscribe(plan.id)}
                disabled={plan.id === 'free-trial'}
              >
                {plan.id === 'free-trial'
                  ? 'Start Free Trial'
                  : `Subscribe to ${plan.name}`
                }
              </Button>
            </CardFooter>
          </Card>
        ))}
      </div>

      {/* FAQ or Additional Info */}
      <div className="text-center text-sm text-muted-foreground">
        <p>{t('subscription.footer')}</p>
      </div>

      {/* Payment Modal */}
      {paymentModal.plan && (
        <PaymentModal
          isOpen={paymentModal.isOpen}
          onClose={handlePaymentClose}
          planName={paymentModal.plan.name}
          price={paymentModal.plan.price}
          credits={paymentModal.plan.credits}
          billingPeriod={(paymentModal.plan as any).billingPeriod || 'one-time'}
        />
      )}
    </div>
  );
}