import { Brain } from "lucide-react";

interface LogoProps {
  size?: number;
  showText?: boolean;
}

export function Logo({ size = 32, showText = true }: LogoProps) {
  return (
    <div className="flex items-center gap-2.5">
      <div
        className="grid place-items-center rounded-xl bg-primary text-primary-foreground shadow-glow animate-pop"
        style={{ width: size, height: size }}
      >
        <Brain size={size * 0.55} strokeWidth={2.2} />
      </div>
      {showText && (
        <div className="leading-none">
          <div className="font-display text-lg font-bold tracking-tight">Tyn Tutor</div>
          <div className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
            Think Better. Learn Smarter.
          </div>
        </div>
      )}
    </div>
  );
}
