/**
 * Shared main-window center outcome overlay composition.
 *
 * Mechanically extracted from App.tsx (the `centerOverlayVisual` switch block)
 * so the Electron main window and the Browser Lab share one browser-safe
 * implementation. App remains the owner of center overlay state, outcome
 * timers, and diagnostic copy; this component renders already-projected
 * CenterOverlayVisual facts.
 */
import {
  useState,
} from "react";
import { AnimatePresence, motion } from "motion/react";
import { useTranslation } from "react-i18next";
import { useTheme } from "../../contexts/ThemeContext";
import { CircularProgressIndicator } from "../../components/CircularProgressIndicator";
import { ForegroundOutcomeOverlay } from "../../components/ForegroundOutcomeOverlay";
import { FolderCheckIcon } from "../../components/icons/AppIcons";
import {
  CENTER_OVERLAY_CONTENT_STYLE,
  CENTER_OVERLAY_PRESENCE_MOTION,
} from "../../components/foregroundOverlayShared";
import type { CenterOverlayVisual } from "../../utils/centerOverlayState";
import type { ErrorDiagnosticCopyRequest } from "../../types/errorDiagnostics";

export type MainWindowPrimaryTaskView = {
  kind: "download" | "transcode";
  percent: number;
  indeterminate: boolean;
} | null;

export type MainWindowCenterOverlayProps = {
  centerOverlayVisual: CenterOverlayVisual;
  primaryTask: MainWindowPrimaryTaskView;
  primaryTaskStatusText: string;
  primaryTaskSummaryText: string;
  onCopyDiagnostic: (diagnostic: ErrorDiagnosticCopyRequest) => void;
  showPrimaryCancel: boolean;
  isPrimaryCancelPending: boolean;
  primaryTaskTraceId: string | null;
  onCancelPrimaryTask: (traceId: string) => void;
};

export const MainWindowCenterOverlay = (props: MainWindowCenterOverlayProps) => {
  const { colors } = useTheme();
  const { t } = useTranslation("desktop");
  const { centerOverlayVisual, primaryTask } = props;
  const [isProgressCancelHovered, setIsProgressCancelHovered] = useState(false);

  const primaryTaskStroke = primaryTask?.kind === "transcode"
    ? colors.transcodeSolid
    : colors.progressFgStroke;
  const primaryTaskTrackStroke = primaryTask?.kind === "transcode"
    ? colors.transcodeTrack
    : colors.progressBgStroke;
  const primaryTaskTextColor = primaryTask?.kind === "transcode"
    ? colors.transcodeText
    : colors.progressText;
  const primaryTaskStatusColor = primaryTask?.kind === "transcode"
    ? colors.transcodeMutedText
    : colors.accentText;
  const primaryTaskPillBackground = primaryTask?.kind === "transcode"
    ? colors.transcodeSurface
    : colors.accentSurface;
  const primaryTaskPillBorder = primaryTask?.kind === "transcode"
    ? colors.transcodeBorder
    : colors.accentBorder;
  const primaryTaskPillText = primaryTask?.kind === "transcode"
    ? colors.transcodeText
    : colors.accentText;

  return (
    <>
      <AnimatePresence mode="sync">
        {centerOverlayVisual.kind === "task-progress" && primaryTask ? (
        <motion.div
          key={centerOverlayVisual.key}
          data-mr9-coverable="task-progress"
          initial={CENTER_OVERLAY_PRESENCE_MOTION.initial}
          animate={CENTER_OVERLAY_PRESENCE_MOTION.animate}
          exit={CENTER_OVERLAY_PRESENCE_MOTION.exit}
          transition={CENTER_OVERLAY_PRESENCE_MOTION.transition}
          draggable={false}
          style={CENTER_OVERLAY_CONTENT_STYLE}
        >
          {primaryTask.kind === "transcode" ? (
            <CircularProgressIndicator
              strokeColor={primaryTaskStroke}
              trackColor={primaryTaskTrackStroke}
              textColor={primaryTaskTextColor}
              percent={primaryTask.percent}
              indeterminate={primaryTask.indeterminate}
            />
          ) : null}
          {props.primaryTaskStatusText ? (
            <span style={{ fontSize: 10, color: primaryTaskStatusColor, lineHeight: 1, userSelect: "none", pointerEvents: "none" }}>
              {props.primaryTaskStatusText}
            </span>
          ) : null}
          {props.primaryTaskSummaryText ? (
            <span
              style={{
                fontSize: 9,
                color: primaryTaskPillText,
                backgroundColor: primaryTaskPillBackground,
                border: `1px solid ${primaryTaskPillBorder}`,
                borderRadius: 999,
                padding: "2px 6px",
                lineHeight: 1.1,
                userSelect: "none",
                pointerEvents: "none",
              }}
            >
              {props.primaryTaskSummaryText}
            </span>
          ) : null}
        </motion.div>
      ) : centerOverlayVisual.kind === "task-processing" ? (
        <motion.div
          key={centerOverlayVisual.key}
          initial={CENTER_OVERLAY_PRESENCE_MOTION.initial}
          animate={CENTER_OVERLAY_PRESENCE_MOTION.animate}
          exit={CENTER_OVERLAY_PRESENCE_MOTION.exit}
          transition={CENTER_OVERLAY_PRESENCE_MOTION.transition}
          draggable={false}
          style={CENTER_OVERLAY_CONTENT_STYLE}
        >
          <CircularProgressIndicator
            strokeColor={colors.accentSolid}
            trackColor={colors.borderStart}
            textColor={colors.textSecondary}
            percent={0}
            indeterminate
          />
        </motion.div>
      ) : centerOverlayVisual.kind === "task-outcome" ? (
        <motion.div
          key={centerOverlayVisual.key}
          initial={CENTER_OVERLAY_PRESENCE_MOTION.initial}
          animate={CENTER_OVERLAY_PRESENCE_MOTION.animate}
          exit={CENTER_OVERLAY_PRESENCE_MOTION.exit}
          transition={CENTER_OVERLAY_PRESENCE_MOTION.transition}
          draggable={false}
          style={{ ...CENTER_OVERLAY_CONTENT_STYLE, zIndex: 3 }}
        >
          <ForegroundOutcomeOverlay
            outcomeVisible={centerOverlayVisual.outcomeVisible}
            status={centerOverlayVisual.status}
            errorMessage={centerOverlayVisual.message}
            showCopyAction={centerOverlayVisual.status === "failure" && Boolean(centerOverlayVisual.diagnostic)}
            onCopyDiagnostic={centerOverlayVisual.diagnostic
              ? () => {
                  if (centerOverlayVisual.diagnostic) {
                    props.onCopyDiagnostic(centerOverlayVisual.diagnostic);
                  }
                }
              : undefined}
            copyDiagnosticLabel={t("app.errorDiagnostic.copy")}
            successColor={colors.successIcon}
            errorColor={colors.errorIcon}
            cancelledColor={colors.progressCancelIcon}
            loadingStrokeColor={colors.accentSolid}
            loadingTrackColor={colors.borderStart}
            loadingTextColor={colors.textSecondary}
          />
        </motion.div>
      ) : centerOverlayVisual.kind === "folder-outcome" ? (
        <motion.div
          key={centerOverlayVisual.key}
          initial={CENTER_OVERLAY_PRESENCE_MOTION.initial}
          animate={CENTER_OVERLAY_PRESENCE_MOTION.animate}
          exit={CENTER_OVERLAY_PRESENCE_MOTION.exit}
          transition={CENTER_OVERLAY_PRESENCE_MOTION.transition}
          draggable={false}
          style={CENTER_OVERLAY_CONTENT_STYLE}
        >
          <ForegroundOutcomeOverlay
            outcomeVisible
            status={centerOverlayVisual.status === "error" ? "failure" : "success"}
            errorMessage={centerOverlayVisual.status === "error" ? centerOverlayVisual.message : null}
            successColor={colors.successIcon}
            errorColor={colors.errorIcon}
            cancelledColor={colors.progressCancelIcon}
            loadingStrokeColor={colors.accentSolid}
            loadingTrackColor={colors.borderStart}
            loadingTextColor={colors.textSecondary}
            SuccessIcon={FolderCheckIcon}
            successIconStrokeWidth={2}
          />
        </motion.div>
      ) : null}
    </AnimatePresence>

    <AnimatePresence>
      {props.showPrimaryCancel && primaryTask ? (
        <motion.div
          key={`${centerOverlayVisual.key}-protected-cancel`}
          initial={CENTER_OVERLAY_PRESENCE_MOTION.initial}
          animate={CENTER_OVERLAY_PRESENCE_MOTION.animate}
          exit={CENTER_OVERLAY_PRESENCE_MOTION.exit}
          transition={CENTER_OVERLAY_PRESENCE_MOTION.transition}
          style={{ ...CENTER_OVERLAY_CONTENT_STYLE, zIndex: 3 }}
        >
          <button
            data-mr9-protected-control="primary-cancel"
            onClick={() => {
              if (props.isPrimaryCancelPending) return;
              if (props.primaryTaskTraceId) {
                props.onCancelPrimaryTask(props.primaryTaskTraceId);
              }
            }}
            onMouseDown={(event) => event.stopPropagation()}
            onMouseEnter={() => setIsProgressCancelHovered(true)}
            onMouseLeave={() => setIsProgressCancelHovered(false)}
            style={{
              width: 20,
              height: 20,
              borderRadius: "50%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transform: `translateY(${primaryTask.kind === "transcode" ? 42 : 22}px)`,
              backgroundColor: isProgressCancelHovered
                ? colors.progressCancelHoverBg
                : "transparent",
              border: "none",
              cursor: props.isPrimaryCancelPending ? "default" : "pointer",
              transition: "background-color 0.2s",
              opacity: props.isPrimaryCancelPending ? 0.6 : 1,
              pointerEvents: "auto",
            }}
            title={primaryTask.kind === "transcode"
              ? t("app.actions.exitCurrentTranscode")
              : t("app.actions.cancelCurrentTask")}
          >
            <svg
              width="10"
              height="10"
              viewBox="0 0 10 10"
              style={{
                color: isProgressCancelHovered
                  ? colors.progressCancelHoverIcon
                  : colors.progressCancelIcon,
                transition: "color 0.2s",
                pointerEvents: "none",
              }}
            >
              <path
                d="M2 2L8 8M8 2L2 8"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </motion.div>
      ) : null}
      </AnimatePresence>
    </>
  );
};
