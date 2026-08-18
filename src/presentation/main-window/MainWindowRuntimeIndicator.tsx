/**
 * Shared main-window runtime dependency indicator.
 *
 * Mechanically extracted from App.tsx (the `shouldShowRuntimeIndicator` block)
 * so the Electron main window and the Browser Lab share one browser-safe
 * implementation. App remains the owner of runtime gate state, hover state,
 * retry in-flight state, and recheck commands; this component renders
 * already-projected display facts.
 */
import { AnimatePresence, motion } from "motion/react";
import { useTheme } from "../../contexts/ThemeContext";
import {
  getPanelShellStyle,
  getStatusDotStyle,
} from "../../components/ui/shared-styles";
import type { CSSProperties } from "react";

export type MainWindowRuntimeIndicatorProps = {
  visible: boolean;
  showSuccess: boolean;
  isHovered: boolean;
  onHoverChange: (hovered: boolean) => void;
  headline: string;
  statusText: string;
  footerText: string | null;
  title: string;
  progressPercent: number | null;
  isIndeterminate: boolean;
  shouldRenderRing: boolean;
  requiresManualAction: boolean;
  reducedMotion: boolean;
  isRetryInFlight: boolean;
  isRetryFeedbackVisible: boolean;
  onRecheck: () => void;
};

const RUNTIME_INDICATOR_SIZE = 18;
const RUNTIME_INDICATOR_RADIUS = 7;
const RUNTIME_INDICATOR_CIRCUMFERENCE = 2 * Math.PI * RUNTIME_INDICATOR_RADIUS;

export const MainWindowRuntimeIndicator = (props: MainWindowRuntimeIndicatorProps) => {
  const { colors } = useTheme();

  if (!props.visible) {
    return null;
  }

  const shouldShowRuntimePopover = props.isHovered && !props.showSuccess;
  const fillRatio = props.showSuccess
    ? 1
    : props.progressPercent !== null
      ? Math.max(0.08, props.progressPercent / 100)
      : 0.34;
  const dashOffset = RUNTIME_INDICATOR_CIRCUMFERENCE * (1 - fillRatio);
  const presenceTransition = props.reducedMotion
    ? { duration: 0.1 }
    : { duration: 0.2, ease: [0.22, 1, 0.36, 1] as const };
  const shellAnimate = props.showSuccess && !props.reducedMotion
    ? { scale: [1, 1.18, 1.03], y: [0, -1, 0], opacity: [0.96, 1, 1] }
    : { scale: 1, y: 0, opacity: 1 };
  const shellTransition = props.showSuccess && !props.reducedMotion
    ? { duration: 0.42, ease: [0.22, 1, 0.36, 1] as const, times: [0, 0.56, 1] }
    : { duration: 0.16, ease: [0.22, 1, 0.36, 1] as const };
  const popoverStyle: CSSProperties = {
    position: "absolute",
    left: 0,
    bottom: 0,
    marginBottom: 26,
    width: 166,
    display: "flex",
    flexDirection: "column",
    gap: 7,
    padding: "10px 10px 9px",
    ...getPanelShellStyle(colors, {
      radius: 12,
      boxShadow: `inset 0 0 0 1px ${props.requiresManualAction ? colors.warningBorder : colors.borderStart}, inset 0 1px 0 ${colors.fieldInset}, ${colors.panelShadowStrong}`,
    }),
    backdropFilter: "blur(14px)",
    transformOrigin: "bottom left",
  };
  const statusDotStyle: CSSProperties = {
    ...getStatusDotStyle(colors.warningSolid, colors.warningGlow),
    width: 6,
    height: 6,
    boxShadow: `0 0 8px ${colors.warningGlow}`,
  };
  const progressTrackStyle: CSSProperties = {
    width: "100%",
    height: 5,
    borderRadius: 999,
    overflow: "hidden",
    background: `linear-gradient(180deg, ${colors.fieldBg} 0%, ${colors.bgPrimary} 100%)`,
    boxShadow: `inset 0 0 0 1px ${colors.fieldBorder}`,
  };
  const progressFillStyle: CSSProperties = {
    width: props.isIndeterminate ? "38%" : `${props.progressPercent ?? 100}%`,
    height: "100%",
    borderRadius: 999,
    background: `linear-gradient(90deg, ${colors.warningSolid} 0%, ${colors.warningText} 100%)`,
    boxShadow: `0 0 12px ${colors.warningGlow}`,
    animation: props.isIndeterminate ? "shimmer 1.2s ease-in-out infinite" : "none",
    transformOrigin: "left center",
    transition: props.isIndeterminate ? "none" : "width 0.22s ease",
  };

  return (
    <AnimatePresence>
      {props.visible ? (
        <motion.div
          initial={props.reducedMotion
            ? { opacity: 0 }
            : { opacity: 0, scale: 0.9, y: 6, filter: "blur(1.5px)" }}
          animate={props.reducedMotion
            ? { opacity: 1 }
            : { opacity: 1, scale: 1, y: 0, filter: "blur(0px)" }}
          exit={props.reducedMotion
            ? { opacity: 0 }
            : { opacity: 0, scale: 0.78, y: 8, filter: "blur(1.5px)" }}
          transition={presenceTransition}
          style={{
            position: "absolute",
            left: 12,
            bottom: 12,
            zIndex: 12,
            transformOrigin: "bottom left",
          }}
          data-panel-double-click="ignore"
          onMouseEnter={() => props.onHoverChange(true)}
          onMouseLeave={() => props.onHoverChange(false)}
        >
          <AnimatePresence>
            {shouldShowRuntimePopover ? (
              <motion.div
                initial={{ opacity: 0, scale: 0.94, y: 4 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96, y: 4 }}
                transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
                style={popoverStyle}
                onMouseDown={(e) => e.stopPropagation()}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                  <span style={statusDotStyle} />
                  <span
                    style={{
                      minWidth: 0,
                      fontSize: 10,
                      fontWeight: 700,
                      color: colors.textPrimary,
                      lineHeight: 1.1,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      userSelect: "none",
                    }}
                  >
                    {props.headline}
                  </span>
                </div>

                {props.shouldRenderRing ? (
                  <div style={progressTrackStyle}>
                    <div style={progressFillStyle} />
                  </div>
                ) : null}

                <span
                  title={props.statusText}
                  style={{
                    fontSize: 9,
                    lineHeight: 1.24,
                    color: props.requiresManualAction ? colors.warningText : colors.textSecondary,
                    display: "-webkit-box",
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: "vertical",
                    overflow: "hidden",
                  }}
                >
                  {props.statusText}
                </span>

                {props.footerText ? (
                  <span
                    style={{
                      fontSize: 8,
                      lineHeight: 1.2,
                      color: colors.textSecondary,
                      opacity: 0.88,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {props.footerText}
                  </span>
                ) : null}
              </motion.div>
            ) : null}
          </AnimatePresence>

          {props.shouldRenderRing ? (
            <motion.div
              initial={false}
              onMouseDown={(e) => e.stopPropagation()}
              title={props.title}
              animate={shellAnimate}
              transition={shellTransition}
              style={{
                position: "relative",
                width: 24,
                height: 24,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: "50%",
                background: `linear-gradient(180deg, ${colors.fieldBg} 0%, ${colors.bgSecondary} 100%)`,
                boxShadow: props.showSuccess
                  ? `inset 0 0 0 1px ${colors.warningBorder}, inset 0 1px 0 ${colors.fieldInset}, 0 0 14px ${colors.warningGlow}`
                  : `inset 0 0 0 1px ${colors.borderStart}, inset 0 1px 0 ${colors.fieldInset}`,
                pointerEvents: "auto",
                transition: "box-shadow 0.18s ease",
              }}
            >
              {props.showSuccess && !props.reducedMotion ? (
                <motion.span
                  initial={{ opacity: 0.22, scale: 0.84 }}
                  animate={{ opacity: [0.2, 0.44, 0], scale: [0.84, 1.42, 1.68] }}
                  transition={{ duration: 0.52, ease: [0.22, 1, 0.36, 1], times: [0, 0.48, 1] }}
                  style={{
                    position: "absolute",
                    inset: 1,
                    borderRadius: "50%",
                    border: `1px solid ${colors.warningBorder}`,
                    pointerEvents: "none",
                  }}
                />
              ) : null}
              <svg
                width={RUNTIME_INDICATOR_SIZE}
                height={RUNTIME_INDICATOR_SIZE}
                viewBox={`0 0 ${RUNTIME_INDICATOR_SIZE} ${RUNTIME_INDICATOR_SIZE}`}
                style={{ transform: "rotate(-90deg)", display: "block" }}
              >
                <circle
                  cx={RUNTIME_INDICATOR_SIZE / 2}
                  cy={RUNTIME_INDICATOR_SIZE / 2}
                  r={RUNTIME_INDICATOR_RADIUS}
                  fill="none"
                  stroke={colors.progressBgStroke}
                  strokeWidth="2"
                />
                <circle
                  cx={RUNTIME_INDICATOR_SIZE / 2}
                  cy={RUNTIME_INDICATOR_SIZE / 2}
                  r={RUNTIME_INDICATOR_RADIUS}
                  fill="none"
                  stroke={colors.warningSolid}
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeDasharray={RUNTIME_INDICATOR_CIRCUMFERENCE}
                  strokeDashoffset={dashOffset}
                  style={{
                    transition: props.isIndeterminate
                      ? "none"
                      : "stroke-dashoffset 0.24s ease, opacity 0.18s ease",
                    animation: props.isIndeterminate ? "spin 1s linear infinite" : "none",
                    transformOrigin: "center",
                    opacity: props.showSuccess ? 1 : 0.96,
                  }}
                />
              </svg>
            </motion.div>
          ) : (
            <motion.button
              type="button"
              onMouseDown={(e) => e.stopPropagation()}
              onClick={() => {
                if (props.isRetryInFlight) {
                  return;
                }
                props.onRecheck();
              }}
              title={props.title}
              style={{
                position: "relative",
                width: 24,
                height: 24,
                padding: 0,
                border: "none",
                borderRadius: 999,
                background: "transparent",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: props.isRetryInFlight ? "default" : "pointer",
                opacity: props.isRetryInFlight ? 0.82 : 1,
              }}
              animate={props.isRetryFeedbackVisible ? { scale: [1, 0.92, 1.04, 1] } : { scale: 1 }}
              transition={props.isRetryFeedbackVisible
                ? { duration: 0.18, ease: [0.22, 1, 0.36, 1] }
                : { duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
            >
              <span
                aria-hidden="true"
                style={{
                  position: "absolute",
                  inset: 4,
                  borderRadius: "50%",
                  border: `1px solid ${colors.warningBorder}`,
                  opacity: 0.72,
                  pointerEvents: "none",
                }}
              />
              <motion.span
                aria-hidden="true"
                style={{
                  position: "absolute",
                  inset: 4,
                  borderRadius: "50%",
                  border: `1px solid ${colors.warningBorder}`,
                  boxShadow: `0 0 10px ${colors.warningGlow}`,
                  pointerEvents: "none",
                }}
                animate={props.reducedMotion
                  ? { scale: 1, opacity: 0.64 }
                  : props.isRetryFeedbackVisible
                    ? { scale: [1, 1.16, 1.28], opacity: [0.9, 0.42, 0] }
                    : { scale: [1, 1.14, 1.32], opacity: [0.82, 0.3, 0] }}
                transition={props.reducedMotion
                  ? { duration: 0.16 }
                  : props.isRetryFeedbackVisible
                    ? { duration: 0.46, ease: [0.22, 1, 0.36, 1] }
                    : { duration: 1.45, repeat: Number.POSITIVE_INFINITY, ease: [0.22, 1, 0.36, 1] }}
              />
              <span
                aria-hidden="true"
                style={{
                  position: "absolute",
                  inset: "50%",
                  width: 8,
                  height: 8,
                  marginLeft: -4,
                  marginTop: -4,
                  borderRadius: "50%",
                  backgroundColor: colors.warningSolid,
                  display: "block",
                  pointerEvents: "none",
                  boxShadow: props.isRetryFeedbackVisible
                    ? `0 0 10px ${colors.warningGlow}`
                    : `0 0 6px ${colors.warningGlow}`,
                }}
              />
            </motion.button>
          )}
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
};
