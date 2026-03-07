import { cn } from "../../lib/utils";
import { useTheme } from "../../contexts/ThemeContext";

interface NeonCardProps extends React.HTMLAttributes<HTMLDivElement> {
  glow?: boolean;
}

export function NeonCard({ className, glow = false, children, style, ...props }: NeonCardProps) {
  const { colors } = useTheme();

  return (
    <div
      style={{
        background: `linear-gradient(180deg, ${colors.bgGradientStart} 0%, ${colors.bgGradientEnd} 100%)`,
        borderColor: glow ? colors.accentBorder : colors.fieldBorder,
        boxShadow: glow
          ? `inset 0 1px 0 ${colors.fieldInset}, 0 12px 24px ${colors.accentGlow}`
          : `inset 0 1px 0 ${colors.fieldInset}, ${colors.panelShadow}`,
        ...style,
      }}
      className={cn(
        "rounded-xl border p-4 transition-all duration-300",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}
