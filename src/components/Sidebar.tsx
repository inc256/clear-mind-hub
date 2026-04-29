import { NavLink } from "@/components/NavLink";
import { Brain, History, Search, User, Sparkles } from "lucide-react";
import { Logo } from "@/components/Logo";
import { useTranslation } from "react-i18next";

const getItems = (t: any) => [
  { to: "/", label: t('navigation.tutor'), icon: Brain, end: true },
  { to: "/research", label: t('navigation.research'), icon: Search },
  { to: "/history", label: t('navigation.history'), icon: History },
];

export function Sidebar() {
  const { t } = useTranslation();
  return (
    <aside className="hidden lg:flex w-64 fixed top-0 left-0 h-screen flex-col border-r border-border/60 bg-sidebar/80 backdrop-blur-xl animate-slide-in-left">
      <div className="px-6 py-6 border-b border-border/60">
        <Logo />
      </div>

      <nav className="flex-1 px-3 py-6 space-y-1">
        {getItems(t).map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className="group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
            activeClassName="!bg-blue-500 !text-white shadow-glow hover:!text-white"
          >
            <Icon className="h-4.5 w-4.5" size={18} />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="m-3 rounded-2xl border border-primary/15 bg-accent/60 p-4">
        <NavLink
          to="/profile"
          className="flex items-center gap-2 text-primary-deep hover:text-primary transition-colors"
        >
          <User size={16} />
          <span className="text-xs font-semibold uppercase tracking-wider">{t('navigation.profile')}</span>
        </NavLink>
      </div>
    </aside>
  );
}
