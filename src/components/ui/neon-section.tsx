import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "../../lib/utils";
import { useTheme } from "../../contexts/ThemeContext";
import { getCompactLabelStyle } from "./shared-styles";

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
      style={{ marginBottom: 18, ...style }}
      {...props}
    >
      <div style={{ display: "grid", gap: hint ? 3 : 0, marginBottom: 9 }}>
        <span
          style={{
            ...getCompactLabelStyle(colors),
          }}
        >
          {title}
        </span>
        {hint ? (
          <div
            style={{
              fontSize: 10,
              lineHeight: "1.4",
              color: colors.textSecondary,
              opacity: 0.78,
            }}
          >
            {hint}
          </div>
        ) : null}
      </div>
      <div style={{ display: "grid", gap: contentGap }}>{children}</div>
    </section>
  );
}
