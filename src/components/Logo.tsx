import logo from "@/images/Xplainfy-Icon-Rounded-1080px.png";

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
          alt="Xplainfy Logo"
          className="w-full h-full object-cover"
        />
      </div>
      {showText && (
        <div className="leading-none">
          <div className="font-display text-lg font-bold tracking-tight">Xplainfy</div>
          <div className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
            Anything explained
          </div>
        </div>
      )}
    </div>
  );
}
