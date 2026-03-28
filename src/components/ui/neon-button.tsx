import React from "react";

import { useTheme } from "../../contexts/ThemeContext";
import {
  COMPACT_EASE,
  getContinuousCornerStyle,
  getFieldSurfaceBackground,
} from "./shared-styles";

interface NeonButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'outline' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
}

export function NeonButton({
  variant = 'default',
  size = 'md',
  disabled,
  style,
  children,
  onMouseEnter,
  onMouseLeave,
  onMouseDown,
  onMouseUp,
  onFocus,
  onBlur,
  ...props
}: NeonButtonProps) {
  const { colors } = useTheme();
  const [isHovered, setIsHovered] = React.useState(false);
  const [isPressed, setIsPressed] = React.useState(false);
  const [isFocused, setIsFocused] = React.useState(false);
  const baseStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    ...getContinuousCornerStyle(10),
    fontWeight: 600,
    border: '1px solid transparent',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.5 : 1,
    transition: [
      `background 0.18s ${COMPACT_EASE}`,
      `border-color 0.18s ${COMPACT_EASE}`,
      `box-shadow 0.18s ${COMPACT_EASE}`,
      `color 0.18s ${COMPACT_EASE}`,
      `transform 0.18s ${COMPACT_EASE}`,
    ].join(', '),
    outline: 'none',
    transform: disabled ? 'translateY(0)' : isPressed ? 'translateY(1px) scale(0.985)' : isHovered ? 'translateY(-1px)' : 'translateY(0)',
  };

  const variantStyles: Record<string, React.CSSProperties> = {
    default: {
      background: `linear-gradient(180deg, ${colors.accentText} 0%, ${colors.accentSolid} 100%)`,
      color: colors.knobBg,
      borderColor: colors.accentBorder,
      boxShadow: isFocused || isHovered
        ? `inset 0 1px 0 rgba(255,255,255,0.18), 0 0 0 1px ${colors.accentBorder}, 0 12px 22px ${colors.accentGlow}`
        : `inset 0 1px 0 rgba(255,255,255,0.18), 0 10px 18px ${colors.accentGlow}`,
    },
    outline: {
      background: (isFocused || isHovered)
        ? `linear-gradient(180deg, ${colors.accentSurfaceStrong} 0%, ${colors.accentSurface} 100%)`
        : getFieldSurfaceBackground(colors),
      color: isFocused || isHovered ? colors.textPrimary : colors.accentText,
      borderColor: isFocused ? colors.fieldBorderStrong : colors.accentBorder,
      boxShadow: isFocused || isHovered
        ? `inset 0 0 0 1px ${isFocused ? colors.fieldBorderStrong : colors.accentBorder}, 0 10px 18px ${colors.accentGlow}`
        : `inset 0 1px 0 ${colors.fieldInset}`,
    },
    ghost: {
      background: isFocused || isHovered ? getFieldSurfaceBackground(colors) : 'transparent',
      color: isFocused || isHovered ? colors.textPrimary : colors.textSecondary,
      borderColor: isFocused ? colors.fieldBorderStrong : colors.fieldBorder,
      boxShadow: isFocused || isHovered
        ? `inset 0 0 0 1px ${isFocused ? colors.fieldBorderStrong : colors.fieldBorder}`
        : 'none',
    },
  };

  const sizeStyles: Record<string, React.CSSProperties> = {
    sm: { minHeight: 32, padding: '6px 12px', fontSize: 12 },
    md: { minHeight: 36, padding: '8px 14px', fontSize: 13 },
    lg: { minHeight: 40, padding: '10px 18px', fontSize: 14 },
  };

  return (
    <button
      disabled={disabled}
      onMouseEnter={(event) => {
        setIsHovered(true);
        onMouseEnter?.(event);
      }}
      onMouseLeave={(event) => {
        setIsHovered(false);
        setIsPressed(false);
        onMouseLeave?.(event);
      }}
      onMouseDown={(event) => {
        setIsPressed(true);
        onMouseDown?.(event);
      }}
      onMouseUp={(event) => {
        setIsPressed(false);
        onMouseUp?.(event);
      }}
      onFocus={(event) => {
        setIsFocused(true);
        onFocus?.(event);
      }}
      onBlur={(event) => {
        setIsFocused(false);
        setIsPressed(false);
        onBlur?.(event);
      }}
      style={{
        ...baseStyle,
        ...variantStyles[variant],
        ...sizeStyles[size],
        ...style,
      }}
      {...props}
    >
      {children}
    </button>
  );
}
