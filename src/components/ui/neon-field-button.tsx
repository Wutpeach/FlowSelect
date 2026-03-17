import { useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cn } from "../../lib/utils";
import { useTheme } from "../../contexts/ThemeContext";
import { COMPACT_EASE, getFieldSurfaceStyle } from "./shared-styles";

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
  onMouseEnter,
  onMouseLeave,
  onFocus,
  onBlur,
  children,
  ...props
}: NeonFieldButtonProps) {
  const { colors } = useTheme();
  const [isHovered, setIsHovered] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const highlighted = isHovered || isFocused;

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
        ...getFieldSurfaceStyle(colors, {
          active,
          highlighted,
          padding: "10px 12px",
        }),
        color: active || highlighted ? colors.textPrimary : colors.textSecondary,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.65 : 1,
        ...style,
      }}
      onMouseEnter={(event) => {
        setIsHovered(true);
        onMouseEnter?.(event);
      }}
      onMouseLeave={(event) => {
        setIsHovered(false);
        onMouseLeave?.(event);
      }}
      onFocus={(event) => {
        setIsFocused(true);
        onFocus?.(event);
      }}
      onBlur={(event) => {
        setIsFocused(false);
        onBlur?.(event);
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
          <span
            style={{
              color: active || highlighted ? colors.accentText : colors.textSecondary,
              flexShrink: 0,
              transition: `color 0.18s ${COMPACT_EASE}`,
            }}
          >
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
      {trailingContent ? <span style={{ flexShrink: 0 }}>{trailingContent}</span> : null}
    </button>
  );
}
