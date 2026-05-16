 import { NavLink } from "@/components/NavLink";
import { Brain, History, Search, User, CreditCard } from "lucide-react";
import { Logo } from "@/components/Logo";
import { useTranslation } from "react-i18next";
import { hapticLight } from "@/lib/haptic";
import { CreditNavIndicator } from "./CreditNavIndicator";

const getItems = (t: any) => [
  { to: "/", label: t('navigation.tutor'), icon: Brain, end: true },
  { to: "/research", label: t('navigation.research'), icon: Search },
  { to: "/history", label: t('navigation.history'), icon: History },
  { to: "/subscription", label: t('navigation.subscription'), icon: CreditCard },
];

export function Sidebar() {
  const { t } = useTranslation();

  return (
    <aside className="hidden lg:flex w-64 fixed top-0 left-0 h-screen flex-col border-r border-border/60 bg-[#131a2c]/95 backdrop-blur-xl shadow-xl">
      <div className="px-6 py-6 border-b border-white/10">
        <Logo />
        <p className="mt-4 text-xs uppercase tracking-[0.24em] text-primary/70">{t('sidebar.tagline')}</p>
      </div>

      <nav className="flex-1 px-4 py-6 space-y-2">
         {getItems(t).map(({ to, label, icon: Icon, end }) => (
           <NavLink
             key={to}
             to={to}
             end={end}
             className="group flex items-center gap-3 rounded-3xl px-4 py-3 text-sm font-semibold text-slate-300 hover:bg-white/10 hover:text-white transition-colors"
             activeClassName="!bg-primary !text-white shadow-lg"
             onClick={hapticLight}
           >
             <Icon className="h-4.5 w-4.5" size={18} />
             <span>{label}</span>
           </NavLink>
         ))}
       </nav>

      <div className="m-4 rounded-3xl bg-slate-900/90 border border-white/10 p-4 shadow-inner space-y-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs uppercase tracking-[0.24em] text-primary/70">{t('navigation.credits') || 'Credits'}</p>
          <CreditNavIndicator compact />
        </div>
         <NavLink
           to="/profile"
           className="flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-semibold text-slate-100 hover:bg-white/10 transition-colors"
           onClick={hapticLight}
         >
           <User size={18} />
           <span>{t('navigation.profile')}</span>
         </NavLink>
       </div>
    </aside>
  );
}
