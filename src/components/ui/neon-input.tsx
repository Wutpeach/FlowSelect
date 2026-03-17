import { useState } from "react";
import { cn } from "../../lib/utils";
import { useTheme } from "../../contexts/ThemeContext";
import { getFieldSurfaceStyle } from "./shared-styles";

interface NeonInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  icon?: React.ReactNode;
}

export function NeonInput({
  className,
  icon,
  style,
  onFocus,
  onBlur,
  onMouseEnter,
  onMouseLeave,
  ...props
}: NeonInputProps) {
  const { colors } = useTheme();
  const [isHovered, setIsHovered] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const highlighted = isHovered || isFocused;

  return (
    <div className="relative">
      {icon ? (
        <span
          className="absolute left-3 top-1/2 -translate-y-1/2"
          style={{ color: highlighted ? colors.accentText : colors.controlMuted }}
        >
          {icon}
        </span>
      ) : null}
      <input
        style={{
          ...getFieldSurfaceStyle(colors, {
            active: isFocused,
            highlighted,
            padding: icon ? "0 12px 0 38px" : "0 12px",
          }),
          width: "100%",
          color: colors.textPrimary,
          fontSize: 12,
          outline: "none",
          ...style,
        }}
        className={cn("w-full placeholder:opacity-100", className)}
        onFocus={(event) => {
          setIsFocused(true);
          onFocus?.(event);
        }}
        onBlur={(event) => {
          setIsFocused(false);
          onBlur?.(event);
        }}
        onMouseEnter={(event) => {
          setIsHovered(true);
          onMouseEnter?.(event);
        }}
        onMouseLeave={(event) => {
          setIsHovered(false);
          onMouseLeave?.(event);
        }}
        {...props}
      />
    </div>
  );
}
