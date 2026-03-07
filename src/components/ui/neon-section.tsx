import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "../../lib/utils";
import { useTheme } from "../../contexts/ThemeContext";

interface NeonSectionProps extends HTMLAttributes<HTMLElement> {
  title: string;
  hint?: ReactNode;
  contentGap?: number;
}

export function NeonSection({
  title,
  hint,
  contentGap = 8,
  children,
  className,
  style,
  ...props
}: NeonSectionProps) {
  const { colors } = useTheme();

  return (
    <section
      className={cn("flex flex-col", className)}
      style={{ marginBottom: 20, ...style }}
      {...props}
    >
      <div style={{ display: "grid", gap: hint ? 4 : 0, marginBottom: 8 }}>
        <span
          style={{
            fontSize: 11,
            color: colors.textSecondary,
            display: "block",
            letterSpacing: 0.18,
          }}
        >
          {title}
        </span>
        {hint ? (
          <div
            style={{
              fontSize: 10,
              lineHeight: "1.35",
              color: colors.textSecondary,
              opacity: 0.82,
            }}
          >
            {hint}
          </div>
        ) : null}
      </div>
      <div style={{ display: "grid", gap: contentGap }}>
        {children}
      </div>
    </section>
  );
}
