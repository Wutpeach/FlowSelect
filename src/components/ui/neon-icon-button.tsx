import { useState, type ButtonHTMLAttributes } from "react";
import { useTheme } from "../../contexts/ThemeContext";
import { getChromeButtonStyle } from "./shared-styles";

interface NeonIconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  visible?: boolean;
  tone?: "default" | "danger";
  size?: number;
  radius?: number;
}

export function NeonIconButton({
  visible = true,
  tone = "default",
  size = 18,
  radius,
  style,
  onMouseEnter,
  onMouseLeave,
  onFocus,
  onBlur,
  children,
  ...props
}: NeonIconButtonProps) {
  const { colors } = useTheme();
  const [isHovered, setIsHovered] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const highlighted = isHovered || isFocused;

  return (
    <button
      type="button"
      style={{
        ...getChromeButtonStyle(colors, {
          visible,
          highlighted,
          tone,
          size,
          radius,
        }),
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
      {children}
    </button>
  );
}
