import { ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import { BottomNav } from "./BottomNav";
import { Logo } from "./Logo";
import { CreditNavIndicator } from "./CreditNavIndicator";
import { FeedbackButton, FeedbackFab } from "./FeedbackFab";

export function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen w-full">
      <Sidebar />
      <div className="lg:ml-64 flex-1 flex flex-col min-w-0">
        <header className="lg:hidden sticky top-0 z-30 flex items-center justify-between gap-3 px-4 py-3 border-b border-border/60 bg-background/80 backdrop-blur-xl">
          <Logo size={28} />
          <div className="flex items-center gap-2">
            <CreditNavIndicator compact />
            <FeedbackButton />
          </div>
        </header>
        <main className="flex-1 pb-20 lg:pb-0">{children}</main>
      </div>
      <BottomNav />
      <FeedbackFab />
    </div>
  );
}
