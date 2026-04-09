import type { CSSProperties } from "react";
import type { Theme, ThemeColors } from "../../contexts/ThemeContext";

export const COMPACT_EASE = "cubic-bezier(0.22, 1, 0.36, 1)";
const CONTINUOUS_CORNER_SHAPE = "superellipse(1.5)";
const ELECTRON_CONTINUOUS_CORNER_SMOOTHING = "60%";

type ContinuousCornerStyle = CSSProperties & {
  cornerShape?: string;
  ["-electron-corner-smoothing"]?: string;
};

export const WINDOW_DRAG_REGION_STYLE = {
  WebkitAppRegion: "drag",
  cursor: "grab",
  userSelect: "none",
} as CSSProperties & { WebkitAppRegion: string };

export const WINDOW_NO_DRAG_REGION_STYLE = {
  WebkitAppRegion: "no-drag",
} as CSSProperties & { WebkitAppRegion: string };

interface PanelShellOptions {
  radius?: number;
  boxShadow?: string;
}

interface ShadowBackdropOptions {
  radius?: number | string;
  boxShadow?: string;
  inset?: number | string;
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

interface WindowShellOptions {
  radius?: number;
  borderColor?: string;
  elevation?: "none" | "panel" | "strong";
  clip?: boolean;
  includeLightBottomInset?: boolean;
}

interface WindowHeaderOptions {
  padding?: string;
  gap?: number;
  dragRegion?: boolean;
}

interface WindowBodyOptions {
  padding?: string;
  gap?: number;
  scrollable?: boolean;
}

interface WindowFooterOptions {
  padding?: string;
}

interface NoticeStyleOptions {
  tone?: "default" | "danger" | "warning";
  padding?: string;
  radius?: number;
}

export const getContinuousCornerStyle = (
  radius: number | string,
): ContinuousCornerStyle => ({
  borderRadius: radius,
  cornerShape: CONTINUOUS_CORNER_SHAPE,
  ["-electron-corner-smoothing"]: ELECTRON_CONTINUOUS_CORNER_SMOOTHING,
});

const formatCornerRadius = (radius: number | string): string => (
  typeof radius === "number" ? `${radius}px` : radius
);

export const getContinuousCornerClipPath = (
  radius: number | string,
): string => `inset(0 round ${formatCornerRadius(radius)})`;

export const getPanelShellStyle = (
  colors: ThemeColors,
  { radius = 16, boxShadow }: PanelShellOptions = {},
): CSSProperties => ({
  ...getContinuousCornerStyle(radius),
  background: `linear-gradient(180deg, ${colors.bgGradientStart} 0%, ${colors.bgGradientEnd} 100%)`,
  border: "none",
  boxShadow: boxShadow ?? `inset 0 0 0 1px ${colors.borderStart}, ${colors.panelShadow}`,
});

export const getShadowBackdropStyle = (
  colors: ThemeColors,
  {
    radius = 16,
    boxShadow,
    inset = 0,
  }: ShadowBackdropOptions = {},
): CSSProperties => ({
  position: "absolute",
  inset,
  pointerEvents: "none",
  boxSizing: "border-box",
  overflow: "visible",
  background: "transparent",
  boxShadow: boxShadow ?? colors.panelShadow,
  ...getContinuousCornerStyle(radius),
});

export const getWindowShellStyle = (
  colors: ThemeColors,
  theme: Theme,
  {
    radius = 16,
    borderColor = colors.borderStart,
    elevation = "none",
    clip = true,
    includeLightBottomInset = false,
  }: WindowShellOptions = {},
): CSSProperties => {
  const shellInnerGlow = elevation === "strong"
    ? `inset 0 0 28px ${colors.shadowColor}`
    : elevation === "panel"
      ? `inset 0 0 18px ${colors.shadowColor}`
      : null;

  return {
    width: "100%",
    height: "100%",
    boxSizing: "border-box",
    display: "flex",
    flexDirection: "column",
    isolation: "isolate",
    overflow: "hidden",
    clipPath: clip ? getContinuousCornerClipPath(radius) : undefined,
    ...getPanelShellStyle(colors, {
      radius,
      boxShadow: [
        `inset 0 0 0 1px ${borderColor}`,
        `inset 0 1px 0 ${colors.fieldInset}`,
        includeLightBottomInset && theme === "white"
          ? `inset 0 -1px 0 ${colors.shadowSpread}`
          : null,
        shellInnerGlow,
      ].filter(Boolean).join(", "),
    }),
  };
};

export const getWindowHeaderStyle = (
  colors: ThemeColors,
  {
    padding = "14px 16px 12px",
    gap = 12,
    dragRegion = false,
  }: WindowHeaderOptions = {},
): CSSProperties => ({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap,
  padding,
  borderBottom: `1px solid ${colors.borderStart}`,
  background: "transparent",
  ...(dragRegion ? WINDOW_DRAG_REGION_STYLE : {}),
});

export const getWindowBodyStyle = ({
  padding = "18px",
  gap = 12,
  scrollable = true,
}: WindowBodyOptions = {}): CSSProperties => ({
  flex: 1,
  minHeight: 0,
  padding,
  display: "flex",
  flexDirection: "column",
  gap,
  overflowY: scrollable ? "auto" : "visible",
});

export const getWindowFooterStyle = (
  colors: ThemeColors,
  {
    padding = "8px 16px",
  }: WindowFooterOptions = {},
): CSSProperties => ({
  padding,
  textAlign: "center",
  borderTop: `1px solid ${colors.borderStart}`,
  background: "transparent",
});

export const getNoticeStyle = (
  colors: ThemeColors,
  {
    tone = "default",
    padding = "10px 12px",
    radius = 12,
  }: NoticeStyleOptions = {},
): CSSProperties => {
  const borderColor = tone === "danger"
    ? colors.dangerBorder
    : tone === "warning"
      ? colors.warningBorder
      : colors.fieldBorder;

  const textColor = tone === "danger"
    ? colors.dangerText
    : tone === "warning"
      ? colors.warningText
      : colors.textSecondary;

  return {
    ...getContinuousCornerStyle(radius),
    padding,
    background: colors.fieldBg,
    boxShadow: `inset 0 0 0 1px ${borderColor}`,
    color: textColor,
    fontSize: 11,
    lineHeight: 1.45,
  };
};

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
  ...getContinuousCornerStyle(radius),
  minHeight: height,
  padding,
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
  ...getContinuousCornerStyle(10),
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
    ...getContinuousCornerStyle(radius),
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
