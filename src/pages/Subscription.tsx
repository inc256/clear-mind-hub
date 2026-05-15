import { SubscriptionPlans } from "@/components/SubscriptionPlans";
import { useTranslation } from "react-i18next";

export default function Subscription() {
  const { t } = useTranslation();

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800">
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 py-6 sm:py-10 space-y-6">
        <header className="text-center space-y-4">
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">
            <span className="bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
              {t('subscription.title')}
            </span>
          </h1>
          <p className="text-slate-400 text-sm sm:text-base max-w-2xl mx-auto">
            {t('subscription.subtitle')}
          </p>
        </header>

        <SubscriptionPlans />
      </div>
    </div>
  );
}