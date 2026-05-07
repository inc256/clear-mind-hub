 import { NavLink } from "@/components/NavLink";
 import { Brain, History, Search, User } from "lucide-react";
 import { useTranslation } from "react-i18next";
 import { hapticLight } from "@/lib/haptic";

 const getItems = (t: any) => [
   { to: "/", label: t('navigation.tutor'), icon: Brain, end: true },
   { to: "/research", label: t('navigation.research'), icon: Search },
   { to: "/history", label: t('navigation.history'), icon: History },
   { to: "/profile", label: t('navigation.profile'), icon: User },
 ];

 export function BottomNav() {
   const { t } = useTranslation();
   return (
     <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40 border-t border-border/60 bg-background/90 backdrop-blur-xl pb-[env(safe-area-inset-bottom)]">
       <ul className="grid grid-cols-4">
         {getItems(t).map(({ to, label, icon: Icon, end }) => (
           <li key={to}>
             <NavLink
               to={to}
               end={end}
               className="flex flex-col items-center justify-center gap-1 py-2.5 text-xs font-medium text-muted-foreground transition-colors"
               activeClassName="!text-blue-500"
               onClick={hapticLight}
             >
               <Icon size={20} />
               <span>{label}</span>
             </NavLink>
           </li>
         ))}
       </ul>
     </nav>
   );
 }
