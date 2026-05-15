import { useState } from "react";
import { MessageCircle } from "lucide-react";
import { useAuth } from "@/store/auth";
import { FeedbackDialog } from "@/components/FeedbackDialog";
import { Button } from "@/components/ui/button";

interface FeedbackButtonProps {
  className?: string;
}

export function FeedbackButton({ className = "" }: FeedbackButtonProps) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);

  if (!user) {
    return null;
  }

  return (
    <>
      <Button
        onClick={() => setOpen(true)}
        variant="secondary"
        size="icon"
        className={`h-10 w-10 rounded-full bg-primary text-white shadow-xl hover:bg-primary/90 ${className}`}
        aria-label="Send feedback"
      >
        <MessageCircle className="h-5 w-5" />
      </Button>
      <FeedbackDialog open={open} onOpenChange={setOpen} userId={user.id} />
    </>
  );
}

export function FeedbackFab() {
  return (
    <div className="hidden md:block fixed bottom-6 right-6 z-50">
      <FeedbackButton className="h-14 w-14 rounded-full bg-primary text-white shadow-xl hover:bg-primary/90" />
    </div>
  );
}
