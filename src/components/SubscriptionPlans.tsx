import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Check, X, Zap, Rocket, Crown, Sparkles, HelpCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { PaymentModal } from "./PaymentModal";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { PLAN_FEATURES, PlanId } from "@/lib/planConstants";

interface Plan {
  id: string;
  name: string;
  description: string;
  price: number;
  period: string;
  credits: string;
  features: string[];
  limitations?: string[];
  popular?: boolean;
  icon: React.ReactNode;
  billingPeriod?: string;
  tagline?: string;
  color?: string;
}

export function SubscriptionPlans() {
  const { t } = useTranslation();
  const [paymentModal, setPaymentModal] = useState<{
    isOpen: boolean;
    plan: Plan | null;
  }>({ isOpen: false, plan: null });

  const plans: Plan[] = [
    {
      id: PlanId.TRIAL,
      name: PLAN_FEATURES[PlanId.TRIAL].name,
      description: PLAN_FEATURES[PlanId.TRIAL].description,
      price: PLAN_FEATURES[PlanId.TRIAL].price,
      period: PLAN_FEATURES[PlanId.TRIAL].period,
      credits: PLAN_FEATURES[PlanId.TRIAL].credits,
      features: [
        t('subscription.plans.features.askLevels'),
        t('subscription.plans.features.researchFundamental'),
        t('subscription.plans.features.allCitationStyles'),
      ],
      limitations: [
        t('subscription.plans.limitations.askAdvancedRequiresPremium'),
        t('subscription.plans.limitations.researchIntermediatePremium'),
        t('subscription.plans.limitations.researchAdvancedUltraOnly'),
        t('subscription.plans.limitations.noAiImageGeneration'),
      ],
      icon: <Zap className="w-6 h-6" />,
      color: "from-blue-500 to-cyan-500",
    },
    {
      id: PlanId.BASIC,
      name: PLAN_FEATURES[PlanId.BASIC].name,
      description: PLAN_FEATURES[PlanId.BASIC].description,
      price: PLAN_FEATURES[PlanId.BASIC].price,
      period: PLAN_FEATURES[PlanId.BASIC].period,
      credits: PLAN_FEATURES[PlanId.BASIC].credits,
      features: [
        t('subscription.plans.features.askAllLevels'),
        t('subscription.plans.features.researchAllButAdvanced'),
        t('subscription.plans.features.allCitationStyles'),
      ],
      limitations: [
        t('subscription.plans.limitations.researchAdvancedRequiresPremium'),
        t('subscription.plans.limitations.noAiImageGeneration'),
        t('subscription.plans.limitations.creditsConsumedWithUsage'),
      ],
      icon: <Sparkles className="w-6 h-6" />,
      color: "from-purple-500 to-pink-500",
    },
    {
      id: PlanId.PRO,
      name: PLAN_FEATURES[PlanId.PRO].name,
      description: PLAN_FEATURES[PlanId.PRO].description,
      price: PLAN_FEATURES[PlanId.PRO].price,
      period: PLAN_FEATURES[PlanId.PRO].period,
      credits: PLAN_FEATURES[PlanId.PRO].credits,
      features: [
        t('subscription.plans.features.askAllLevels'),
        t('subscription.plans.features.researchAllButAdvanced'),
        t('subscription.plans.features.allCitationStyles'),
      ],
      limitations: [
        t('subscription.plans.limitations.researchAdvancedUltraOnly'),
        t('subscription.plans.limitations.noAiImageGeneration'),
      ],
      popular: true,
      icon: <Rocket className="w-6 h-6" />,
      color: "from-amber-500 to-orange-500",
    },
    {
      id: PlanId.ULTRA,
      name: PLAN_FEATURES[PlanId.ULTRA].name,
      description: PLAN_FEATURES[PlanId.ULTRA].description,
      price: PLAN_FEATURES[PlanId.ULTRA].price,
      period: PLAN_FEATURES[PlanId.ULTRA].period,
      credits: PLAN_FEATURES[PlanId.ULTRA].credits,
      features: [
        t('subscription.plans.features.askAllLevels'),
        t('subscription.plans.features.researchAllLevels'),
        t('subscription.plans.features.allCitationStyles'),
      ],
      icon: <Crown className="w-6 h-6" />,
      color: "from-violet-500 to-fuchsia-500",
    },
  ];

  const comparisonFeatures = [
    { name: t('subscription.comparison.dailyCredits'), tooltip: t('subscription.comparison.tooltips.dailyCredits'), trial: "10/day (30 days)", basic: "—", pro: "Unlimited", ultra: "Unlimited" },
    { name: t('subscription.comparison.totalCredits'), tooltip: t('subscription.comparison.tooltips.totalCredits'), trial: "300", basic: "1,000", pro: "Unlimited", ultra: "Unlimited" },
    { name: t('subscription.comparison.askFundamental'), tooltip: t('subscription.comparison.tooltips.askFundamental'), trial: "✓", basic: "✓", pro: "✓", ultra: "✓" },
    { name: t('subscription.comparison.askIntermediate'), tooltip: t('subscription.comparison.tooltips.askIntermediate'), trial: "✓", basic: "✓", pro: "✓", ultra: "✓" },
    { name: t('subscription.comparison.askHigher'), tooltip: t('subscription.comparison.tooltips.askHigher'), trial: "✓", basic: "✓", pro: "✓", ultra: "✓" },
    { name: t('subscription.comparison.askAdvanced'), tooltip: t('subscription.comparison.tooltips.askAdvanced'), trial: "✗", basic: "✓", pro: "✓", ultra: "✓" },
    { name: t('subscription.comparison.researchFundamental'), tooltip: t('subscription.comparison.tooltips.researchFundamental'), trial: "✓", basic: "✓", pro: "✓", ultra: "✓" },
    { name: t('subscription.comparison.researchIntermediate'), tooltip: t('subscription.comparison.tooltips.researchIntermediate'), trial: "Credits", basic: "✓", pro: "✓", ultra: "✓" },
    { name: t('subscription.comparison.researchHigher'), tooltip: t('subscription.comparison.tooltips.researchHigher'), trial: "Credits", basic: "✓", pro: "✓", ultra: "✓" },
    { name: t('subscription.comparison.researchAdvanced'), tooltip: t('subscription.comparison.tooltips.researchAdvanced'), trial: "✗", basic: "✗", pro: "✗", ultra: "✓" },
    { name: t('subscription.comparison.fileUploadSize'), tooltip: t('subscription.comparison.tooltips.fileUploadSize'), trial: "1 MB", basic: "1 MB", pro: "5 MB", ultra: "Unlimited" },
    { name: t('subscription.comparison.maxInputWords'), tooltip: t('subscription.comparison.tooltips.maxInputWords'), trial: "250", basic: "500", pro: "1000", ultra: "Unlimited" },
    { name: t('subscription.comparison.citationStyles'), tooltip: t('subscription.comparison.tooltips.citationStyles'), trial: "APA", basic: t('subscription.comparison.citationStylesBasic'), pro: "All", ultra: "All" },
    { name: t('subscription.comparison.aiIllustrations'), tooltip: t('subscription.comparison.tooltips.aiIllustrations'), trial: "✗", basic: "✗", pro: "✗", ultra: "✓" },
    { name: t('subscription.comparison.advancedModels'), tooltip: t('subscription.comparison.tooltips.advancedModels'), trial: "✗", basic: "✗", pro: "✓", ultra: "✓" },
    { name: t('subscription.comparison.imageGeneration'), tooltip: t('subscription.comparison.tooltips.imageGeneration'), trial: "✗", basic: "✗", pro: "✗", ultra: "✓" },
  ];

  const handleSubscribe = (planId: string) => {
    const plan = plans.find(p => p.id === planId);
    if (plan && plan.id !== PlanId.TRIAL) {
      const billingPeriod = plan.id === PlanId.BASIC ? 'one-time' : 'monthly';
      let creditsNumber = 0;
      if (plan.credits === 'Unlimited') {
        creditsNumber = 999999;
      } else if (plan.id === PlanId.BASIC) {
        creditsNumber = 1000;
      } else {
        creditsNumber = parseInt(plan.credits.match(/\d+/)?.[0] || '0', 10);
      }
      setPaymentModal({ isOpen: true, plan: { ...plan, billingPeriod, credits: creditsNumber.toString() } as any });
    }
  };

  const handlePaymentClose = () => {
    setPaymentModal({ isOpen: false, plan: null });
  };

  const getCheckIcon = (value: string) => {
    if (value === "✓") return <Check className="w-5 h-5 text-green-500 mx-auto" />;
    if (value === "✗") return <X className="w-5 h-5 text-red-400 mx-auto" />;
    return <span className="text-sm font-medium text-slate-300">{value}</span>;
  };

  return (
    <TooltipProvider>
      <div className="space-y-12">
        {/* Plans Grid */}
        <div className="grid gap-6 md:grid-cols-4">
          {plans.map((plan) => (
            <Card
              key={plan.id}
              className={`relative overflow-hidden transition-all duration-300 hover:shadow-xl 
                bg-gradient-to-br from-slate-900/50 to-slate-800/30 backdrop-blur-sm 
                border-white/10 ${plan.popular ? 'border-primary/50 shadow-lg ring-2 ring-primary/20' : ''}`}
            >
              <div className={`h-1 bg-gradient-to-r ${plan.color}`} />
              
              {plan.popular && (
                <div className="absolute -top-3 left-1/2 transform -translate-x-1/2 z-10">
                  <Badge className="bg-gradient-to-r from-primary to-primary/80 text-white border-0 shadow-lg rounded-full px-3 py-1">
                    <Sparkles className="w-3 h-3 mr-1" />
                    {t('subscription.plans.popular')}
                  </Badge>
                </div>
              )}

              <CardHeader className="text-center pb-4">
                <div className={`mx-auto w-14 h-14 rounded-2xl bg-gradient-to-br ${plan.color} flex items-center justify-center text-white shadow-lg mb-4`}>
                  {plan.icon}
                </div>
                <CardTitle className="text-2xl text-white">{plan.name}</CardTitle>
                <CardDescription className="text-slate-400">{plan.description}</CardDescription>
              </CardHeader>

              <CardContent className="space-y-4">
                <div className="text-center">
                  <div className="flex items-baseline justify-center gap-1">
                    <span className="text-4xl font-bold text-white">
                      {plan.price === 0 ? t('subscription.plans.free.name') : `$${plan.price}`}
                    </span>
                    {plan.period && plan.period !== 'one-time' && (
                      <span className="text-sm text-slate-400">{plan.period}</span>
                    )}
                  </div>
                  <div className="text-sm text-slate-400 mt-1">
                    {plan.credits} {t('subscription.credits')}
                  </div>
                </div>

                <div className="space-y-2">
                  {plan.features.map((feature, index) => (
                    <div key={index} className="flex items-start gap-2 text-sm">
                      <Check className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                      <span className="text-slate-300">{feature}</span>
                    </div>
                  ))}
                </div>

                {plan.limitations && plan.limitations.length > 0 && (
                  <div className="pt-3 border-t border-white/10">
                    <p className="text-xs font-semibold text-slate-400 mb-2">LIMITATIONS</p>
                    <div className="space-y-1">
                      {plan.limitations.map((limitation, index) => (
                        <div key={index} className="flex items-start gap-2">
                          <X className="w-3 h-3 text-red-400 mt-0.5 flex-shrink-0" />
                          <span className="text-xs text-slate-400">{limitation}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>

              <CardFooter>
                <Button
                  className="w-full rounded-2xl"
                  variant={plan.id === PlanId.TRIAL ? 'outline' : plan.popular ? 'default' : 'secondary'}
                  onClick={() => handleSubscribe(plan.id)}
                >
                  {plan.id === PlanId.TRIAL ? t('subscription.plans.button.startTrial') : t('subscription.plans.button.getPlan', { plan: plan.name })}
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>

        {/* Feature Comparison Table */}
        <div className="mt-16">
          <div className="text-center mb-8">
            <h3 className="text-2xl font-bold text-white mb-2">{t('subscription.comparison.title')}</h3>
            <p className="text-slate-400">{t('subscription.comparison.subtitle')}</p>
          </div>

          <div className="relative rounded-2xl border border-white/10 bg-gradient-to-br from-slate-900/50 to-slate-800/30 backdrop-blur-sm overflow-hidden shadow-xl">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/10 bg-primary/5">
                    <th className="text-left py-5 px-6 font-semibold text-base text-white">
                      <span className="flex items-center gap-1">
                        Features
                        <HelpCircle className="w-4 h-4 text-slate-400" />
                      </span>
                    </th>
                    {plans.map((plan) => (
                      <th key={plan.id} className="text-center py-5 px-4">
                        <div className="space-y-1">
                          <div className={`inline-flex p-2 rounded-xl bg-gradient-to-br ${plan.color} text-white shadow-md`}>
                            {plan.icon}
                          </div>
                          <div className="font-semibold text-lg text-white">{plan.name}</div>
                          <div className="text-xs text-slate-400">
                            {plan.price === 0 ? t('subscription.plans.free.name') : `$${plan.price}${plan.period}`}
                          </div>
                          {plan.popular && (
                            <Badge variant="secondary" className="text-xs bg-primary/20 text-primary border-primary/30">
                              {t('subscription.plans.popular')}
                            </Badge>
                          )}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {comparisonFeatures.map((feature, idx) => (
                    <tr 
                      key={idx} 
                      className={`border-b border-white/5 transition-colors hover:bg-white/5 ${
                        idx % 2 === 0 ? 'bg-transparent' : 'bg-white/5'
                      }`}
                    >
                      <td className="py-4 px-6">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="flex items-center gap-1 font-medium text-slate-300 cursor-help">
                              {feature.name}
                              <HelpCircle className="w-3.5 h-3.5 text-slate-500" />
                            </span>
                          </TooltipTrigger>
                          <TooltipContent className="bg-slate-800 border-white/10 text-slate-300">
                            <p className="text-xs">{feature.tooltip}</p>
                          </TooltipContent>
                        </Tooltip>
                      </td>
                      <td className="text-center py-4 px-4">{getCheckIcon(feature.trial)}</td>
                      <td className="text-center py-4 px-4">{getCheckIcon(feature.basic)}</td>
                      <td className={`text-center py-4 px-4 ${feature.pro === "✓" ? 'bg-primary/5' : ''}`}>
                        {getCheckIcon(feature.pro)}
                      </td>
                      <td className="text-center py-4 px-4">{getCheckIcon(feature.ultra)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="p-6 bg-primary/5 border-t border-white/10 text-center">
              <p className="text-sm text-slate-400">
                {t('subscription.comparison.footer')}
              </p>
            </div>
          </div>
        </div>

        {/* FAQ Section */}
        <div className="text-center space-y-4 pt-8">
          <div className="flex justify-center gap-8 flex-wrap">
            <div className="flex items-center gap-2 text-sm text-slate-400">
              <Check className="w-4 h-4 text-green-500" />
              <span>{t('subscription.plans.faq.noSetupFees')}</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-slate-400">
              <Check className="w-4 h-4 text-green-500" />
              <span>{t('subscription.plans.faq.cancelAnytime')}</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-slate-400">
              <Check className="w-4 h-4 text-green-500" />
              <span>{t('subscription.plans.faq.emailSupport')}</span>
            </div>
          </div>
          <p className="text-xs text-slate-500">
            {t('subscription.plans.faq.tagline')}
          </p>
        </div>

        {paymentModal.plan && (
          <PaymentModal
            isOpen={paymentModal.isOpen}
            onClose={handlePaymentClose}
            planName={paymentModal.plan.name}
            price={paymentModal.plan.price}
            credits={parseInt(paymentModal.plan.credits) || 999999}
            billingPeriod={(paymentModal.plan as any).billingPeriod || 'one-time'}
          />
        )}
      </div>
    </TooltipProvider>
  );
}