import logo from "@/images/Tyn-Tutor-Logo-1080px.png";

interface LogoProps {
  size?: number;
  showText?: boolean;
}

export function Logo({ size = 32, showText = true }: LogoProps) {
  return (
    <div className="flex items-center gap-2.5">
      <div
        className="grid place-items-center rounded-xl bg-primary text-primary-foreground shadow-glow animate-pop overflow-hidden"
        style={{ width: size, height: size }}
      >
        <img
          src={logo}
          alt="Tyn Tutor Logo"
          className="w-full h-full object-cover"
        />
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
