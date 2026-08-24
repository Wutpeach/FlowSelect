import type { ComponentType, CSSProperties, SVGProps } from "react";
import { motion, useReducedMotion } from "motion/react";

import { CircularProgressIndicator } from "./CircularProgressIndicator";
import { CheckIcon, CloseIcon, CopyIcon } from "./icons/AppIcons";
import { MOTION_EASE } from "./ui/motion";

const FIXED_CENTER_ICON_FRAME_STYLE: CSSProperties = {
  width: 48,
  height: 48,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  pointerEvents: "none",
};

type OutcomeIconProps = SVGProps<SVGSVGElement> & {
  size?: number;
};

/**
 * Typed outcome status for the semantic center content. Success, failure, and
 * cancelled are deliberately three distinct presentation values: the overlay
 * must never collapse failure and cancellation into one boolean contract
 * (MR4 typed terminal semantics preserved through the DOM carrier).
 */
export type ForegroundOutcomeStatus = "success" | "failure" | "cancelled";

export type ForegroundOutcomeOverlayProps = {
  outcomeVisible: boolean;
  status: ForegroundOutcomeStatus;
  errorMessage: string | null;
  successColor: string;
  errorColor: string;
  cancelledColor: string;
  loadingStrokeColor: string;
  loadingTrackColor: string;
  loadingTextColor: string;
  showCopyAction?: boolean;
  onCopyDiagnostic?: () => void;
  copyDiagnosticLabel?: string;
  SuccessIcon?: ComponentType<OutcomeIconProps>;
  successIconStrokeWidth?: number;
};

export const ForegroundOutcomeOverlay = ({
  outcomeVisible,
  status,
  errorMessage,
  successColor,
  errorColor,
  cancelledColor,
  loadingStrokeColor,
  loadingTrackColor,
  loadingTextColor,
  showCopyAction = false,
  onCopyDiagnostic,
  copyDiagnosticLabel,
  SuccessIcon = CheckIcon,
  successIconStrokeWidth = 3,
}: ForegroundOutcomeOverlayProps) => {
  const shouldReduceMotion = useReducedMotion();

  const ringExitTransition = shouldReduceMotion
    ? { duration: 0.1 }
    : {
        opacity: { duration: 0.14, ease: MOTION_EASE.exit },
        scale: { duration: 0.16, ease: MOTION_EASE.exit },
        filter: { duration: 0.16, ease: MOTION_EASE.exit },
      };
  const outcomeEnterTransition = shouldReduceMotion
    ? { duration: 0.12 }
    : {
        duration: 0.34,
        times: [0, 0.46, 1],
        ease: MOTION_EASE.compact,
      };
  const ringAnimate = outcomeVisible
    ? { opacity: 0, scale: 0.58, filter: "blur(1px)" }
    : { opacity: 1, scale: 1, filter: "blur(0px)" };
  const outcomeAnimate = outcomeVisible
    ? shouldReduceMotion
      ? { opacity: 1, scale: 1, filter: "blur(0px)" }
      : {
          opacity: [0, 0, 1],
          scale: [0.84, 0.84, 1],
          filter: ["blur(0.8px)", "blur(0.8px)", "blur(0px)"],
        }
    : { opacity: 0, scale: 0.84, filter: "blur(0.8px)" };
  const outcomeTransition = outcomeVisible
    ? outcomeEnterTransition
    : { duration: shouldReduceMotion ? 0.08 : 0.12, ease: MOTION_EASE.exit };
  const errorMessageAnimate = outcomeVisible
    ? shouldReduceMotion
      ? { opacity: 1, y: 0 }
      : { opacity: [0, 0, 1], y: [4, 4, 0] }
    : { opacity: 0, y: 4 };
  const errorMessageTransition = outcomeVisible
    ? shouldReduceMotion
      ? { duration: 0.12 }
      : { duration: 0.28, times: [0, 0.55, 1], ease: MOTION_EASE.compact }
    : { duration: shouldReduceMotion ? 0.08 : 0.12, ease: MOTION_EASE.exit };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        width: 170,
        maxWidth: "100%",
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          ...FIXED_CENTER_ICON_FRAME_STYLE,
          position: "relative",
        }}
      >
        <motion.div
          animate={ringAnimate}
          transition={ringExitTransition}
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transformOrigin: "center center",
            pointerEvents: "none",
          }}
        >
          <CircularProgressIndicator
            strokeColor={loadingStrokeColor}
            trackColor={loadingTrackColor}
            textColor={loadingTextColor}
            percent={0}
            indeterminate
          />
        </motion.div>
        <motion.div
          animate={outcomeAnimate}
          transition={outcomeTransition}
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transformOrigin: "center center",
            pointerEvents: "none",
          }}
        >
          {status === "success" ? (
            <SuccessIcon size={48} style={{ color: successColor, pointerEvents: "none" }} strokeWidth={successIconStrokeWidth} />
          ) : status === "failure" ? (
            <CloseIcon size={48} style={{ color: errorColor, pointerEvents: "none" }} strokeWidth={3} />
          ) : (
            <CloseIcon size={48} style={{ color: cancelledColor, pointerEvents: "none" }} strokeWidth={3} />
          )}
        </motion.div>
      </div>
      {outcomeVisible && status !== "success" && errorMessage ? (
        <motion.div
          animate={errorMessageAnimate}
          transition={errorMessageTransition}
          title={errorMessage}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 5,
            width: "100%",
            minWidth: 0,
            padding: "0 8px",
            pointerEvents: "none",
          }}
        >
          <span
            style={{
              minWidth: 0,
              maxWidth: showCopyAction ? 128 : 154,
              fontSize: 9,
              lineHeight: 1.2,
              color: loadingTextColor,
              textAlign: "center",
              userSelect: "none",
              pointerEvents: "none",
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            {errorMessage}
          </span>
          {showCopyAction && onCopyDiagnostic ? (
            <button
              type="button"
              aria-label={copyDiagnosticLabel}
              title={copyDiagnosticLabel}
              onMouseDown={(event) => {
                event.stopPropagation();
              }}
              onClick={(event) => {
                event.stopPropagation();
                onCopyDiagnostic();
              }}
              style={{
                width: 18,
                height: 18,
                flex: "0 0 auto",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                padding: 0,
                border: "none",
                borderRadius: 6,
                background: "transparent",
                color: loadingTextColor,
                cursor: "pointer",
                opacity: 0.9,
                pointerEvents: "auto",
              }}
            >
              <CopyIcon size={13} strokeWidth={2} style={{ pointerEvents: "none" }} />
            </button>
          ) : null}
        </motion.div>
      ) : null}
    </div>
  );
};
