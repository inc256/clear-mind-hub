import { SubscriptionPlans } from "@/components/SubscriptionPlans";
import { useTranslation } from "react-i18next";

export default function Subscription() {
  const { t } = useTranslation();

  return (
    <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 py-6 sm:py-10 space-y-6">
      <header className="text-center space-y-4">
        <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight">
          <span className="text-gradient">{t('subscription.title')}</span>
        </h1>
        <p className="text-muted-foreground text-sm sm:text-base max-w-2xl mx-auto">
          {t('subscription.subtitle')}
        </p>
      </header>

      <SubscriptionPlans />
    </div>
  );
}