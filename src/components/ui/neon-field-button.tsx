import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "../../lib/utils";
import { useTheme } from "../../contexts/ThemeContext";

interface NeonFieldButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  leadingIcon?: ReactNode;
  trailingContent?: ReactNode;
  active?: boolean;
}

export function NeonFieldButton({
  leadingIcon,
  trailingContent,
  active = false,
  disabled,
  className,
  style,
  children,
  ...props
}: NeonFieldButtonProps) {
  const { colors } = useTheme();

  return (
    <button
      type="button"
      disabled={disabled}
      className={cn("w-full text-left", className)}
      style={{
        width: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 8,
        padding: "10px 12px",
        borderRadius: 8,
        border: `1px solid ${active ? colors.fieldBorderStrong : colors.fieldBorder}`,
        background: `linear-gradient(180deg, ${colors.bgGradientStart} 0%, ${colors.bgGradientEnd} 100%)`,
        boxShadow: active
          ? `inset 0 0 0 1px ${colors.fieldBorderStrong}, ${colors.panelShadow}`
          : `inset 0 1px 0 ${colors.fieldInset}`,
        color: active ? colors.textPrimary : colors.textSecondary,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.65 : 1,
        transition: "border-color 0.18s ease, box-shadow 0.18s ease, background-color 0.18s ease, color 0.18s ease",
        ...style,
      }}
      {...props}
    >
      <span
        style={{
          minWidth: 0,
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          flex: 1,
        }}
      >
        {leadingIcon ? (
          <span style={{ color: active ? colors.accentText : colors.textSecondary, flexShrink: 0 }}>
            {leadingIcon}
          </span>
        ) : null}
        <span
          style={{
            minWidth: 0,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            fontSize: 12,
          }}
        >
          {children}
        </span>
      </span>
      {trailingContent ? (
        <span style={{ flexShrink: 0 }}>
          {trailingContent}
        </span>
      ) : null}
    </button>
  );
}
