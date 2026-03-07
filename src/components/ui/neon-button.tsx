import React from "react";
import { useTheme } from '../../contexts/ThemeContext';

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
  ...props
}: NeonButtonProps) {
  const { colors } = useTheme();
  const baseStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    fontWeight: 500,
    border: '1px solid transparent',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.5 : 1,
    transition: 'background-color 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease, color 0.18s ease, transform 0.18s ease',
    boxShadow: `inset 0 1px 0 ${colors.fieldInset}`,
    outline: 'none',
  };

  const variantStyles: Record<string, React.CSSProperties> = {
    default: {
      backgroundColor: colors.accentSolid,
      color: colors.knobBg,
      borderColor: colors.accentBorder,
      boxShadow: `inset 0 1px 0 rgba(255,255,255,0.18), 0 10px 18px ${colors.accentGlow}`,
    },
    outline: {
      backgroundColor: colors.accentSurface,
      color: colors.accentText,
      borderColor: colors.accentBorder,
      boxShadow: `inset 0 0 0 1px ${colors.accentBorder}`,
    },
    ghost: {
      backgroundColor: 'transparent',
      color: colors.textSecondary,
      borderColor: colors.fieldBorder,
      boxShadow: `inset 0 0 0 1px ${colors.fieldBorder}`,
    },
  };

  const sizeStyles: Record<string, React.CSSProperties> = {
    sm: { padding: '6px 12px', fontSize: 14 },
    md: { padding: '8px 16px', fontSize: 14 },
    lg: { padding: '12px 24px', fontSize: 16 },
  };

  return (
    <button
      disabled={disabled}
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
