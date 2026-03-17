import type { CSSProperties } from "react";
import type { ThemeColors } from "../../contexts/ThemeContext";

export const COMPACT_EASE = "cubic-bezier(0.22, 1, 0.36, 1)";

interface PanelShellOptions {
  radius?: number;
  boxShadow?: string;
}

interface FieldSurfaceOptions {
  active?: boolean;
  highlighted?: boolean;
  padding?: string;
  height?: number;
  radius?: number;
}

interface ChromeButtonOptions {
  visible?: boolean;
  highlighted?: boolean;
  tone?: "default" | "danger";
  size?: number;
  radius?: number;
}

export const getPanelShellStyle = (
  colors: ThemeColors,
  { radius = 16, boxShadow }: PanelShellOptions = {},
): CSSProperties => ({
  background: `linear-gradient(180deg, ${colors.bgGradientStart} 0%, ${colors.bgGradientEnd} 100%)`,
  borderRadius: radius,
  border: "none",
  boxShadow: boxShadow ?? `inset 0 0 0 1px ${colors.borderStart}, ${colors.panelShadow}`,
});

export const getFieldSurfaceBackground = (colors: ThemeColors): string =>
  `linear-gradient(180deg, ${colors.fieldBg} 0%, ${colors.bgSecondary} 100%)`;

export const getFieldSurfaceStyle = (
  colors: ThemeColors,
  {
    active = false,
    highlighted = false,
    padding = "0 12px",
    height = 36,
    radius = 10,
  }: FieldSurfaceOptions = {},
): CSSProperties => ({
  minHeight: height,
  padding,
  borderRadius: radius,
  border: `1px solid ${active ? colors.fieldBorderStrong : highlighted ? colors.borderStart : colors.fieldBorder}`,
  background: getFieldSurfaceBackground(colors),
  boxShadow: active
    ? `inset 0 0 0 1px ${colors.fieldBorderStrong}, ${colors.panelShadow}`
    : highlighted
      ? `inset 0 0 0 1px ${colors.borderStart}, inset 0 1px 0 ${colors.fieldInset}`
      : `inset 0 1px 0 ${colors.fieldInset}`,
  transition: [
    `border-color 0.18s ${COMPACT_EASE}`,
    `box-shadow 0.18s ${COMPACT_EASE}`,
    `color 0.18s ${COMPACT_EASE}`,
    `transform 0.18s ${COMPACT_EASE}`,
  ].join(", "),
});

export const getCompactLabelStyle = (colors: ThemeColors): CSSProperties => ({
  fontSize: 10,
  fontWeight: 600,
  color: colors.textSecondary,
  display: "block",
  minHeight: 14,
  lineHeight: "14px",
  letterSpacing: "0.08em",
  textTransform: "uppercase",
});

export const getSelectableOptionStyle = (
  colors: ThemeColors,
  active: boolean,
  highlighted = false,
): CSSProperties => ({
  ...getFieldSurfaceStyle(colors, {
    active,
    highlighted,
    padding: "8px 12px",
    height: 40,
    radius: 10,
  }),
  color: active ? colors.textPrimary : highlighted ? colors.textPrimary : colors.textSecondary,
  background: active
    ? `linear-gradient(180deg, ${colors.accentSurfaceStrong} 0%, ${colors.accentSurface} 100%)`
    : getFieldSurfaceBackground(colors),
  boxShadow: active
    ? `inset 0 0 0 1px ${colors.accentBorder}, inset 0 1px 0 ${colors.fieldInset}`
    : highlighted
      ? `inset 0 0 0 1px ${colors.borderStart}, inset 0 1px 0 ${colors.fieldInset}`
      : `inset 0 1px 0 ${colors.fieldInset}`,
  fontSize: 12,
  fontWeight: active ? 600 : 500,
  lineHeight: 1.1,
  cursor: "pointer",
});

export const getInsetCardStyle = (
  colors: ThemeColors,
  borderColor = colors.borderStart,
): CSSProperties => ({
  borderRadius: 10,
  border: `1px solid ${borderColor}`,
  background: `linear-gradient(180deg, ${colors.bgPrimary} 0%, ${colors.bgSecondary} 100%)`,
  boxShadow: `inset 0 0 0 1px ${borderColor}, ${colors.panelShadow}`,
});

export const getStatusDotStyle = (color: string, glow: string): CSSProperties => ({
  width: 8,
  height: 8,
  borderRadius: "50%",
  backgroundColor: color,
  boxShadow: `0 0 6px ${glow}`,
  flexShrink: 0,
});

export const getChromeButtonStyle = (
  colors: ThemeColors,
  {
    visible = true,
    highlighted = false,
    tone = "default",
    size = 18,
    radius = 6,
  }: ChromeButtonOptions = {},
): CSSProperties => {
  const isDanger = tone === "danger";
  const hoverBorder = isDanger ? colors.dangerBorder : colors.borderStart;

  return {
    width: size,
    height: size,
    padding: 0,
    border: "none",
    borderRadius: radius,
    backgroundColor: highlighted
      ? isDanger ? colors.dangerSurface : colors.fieldHoverBg
      : "transparent",
    boxShadow: highlighted ? `inset 0 0 0 1px ${hoverBorder}` : "none",
    color: highlighted
      ? isDanger ? colors.dangerText : colors.controlMutedHover
      : colors.controlMuted,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: visible ? "pointer" : "default",
    opacity: visible ? 1 : 0,
    pointerEvents: visible ? "auto" : "none",
    transition: [
      `opacity 0.18s ${COMPACT_EASE}`,
      `background-color 0.18s ${COMPACT_EASE}`,
      `box-shadow 0.18s ${COMPACT_EASE}`,
      `color 0.18s ${COMPACT_EASE}`,
    ].join(", "),
  };
};
