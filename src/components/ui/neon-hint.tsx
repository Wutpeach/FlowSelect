import type { HTMLAttributes } from "react";
import { cn } from "../../lib/utils";
import { useTheme } from "../../contexts/ThemeContext";

type NeonHintTone = "default" | "accent" | "danger";
type NeonHintSize = "xs" | "sm";

interface NeonHintProps extends HTMLAttributes<HTMLDivElement> {
  tone?: NeonHintTone;
  size?: NeonHintSize;
}

export function NeonHint({
  tone = "default",
  size = "xs",
  className,
  style,
  children,
  ...props
}: NeonHintProps) {
  const { colors } = useTheme();

  const colorMap = {
    default: colors.textSecondary,
    accent: colors.accentText,
    danger: colors.dangerText,
  };

  return (
    <div
      className={cn(className)}
      style={{
        fontSize: size === "sm" ? 11 : 10,
        lineHeight: size === "sm" ? "1.4" : "1.35",
        color: colorMap[tone],
        opacity: tone === "default" ? 0.82 : 1,
        ...style,
      }}
      {...props}
    >
      {children}
    </div>
  );
}
