/**
 * Shared main-window Download/Transcode queue badge + popover.
 *
 * Mechanically extracted from App.tsx (the inline `showVideoTaskBadge ||
 * isQueuePopoverOpen` block) so the Electron main window and the Browser Lab
 * share one browser-safe presentational implementation. App remains the owner
 * of subscriptions, refs, timers, commands, hover state, and optimistic
 * rollback; this component receives already-projected production facts plus
 * App-owned callbacks.
 */
import {
  forwardRef,
  type ReactNode,
} from "react";
import { AnimatePresence, motion } from "motion/react";
import { useTranslation } from "react-i18next";
import { useTheme } from "../../contexts/ThemeContext";
import {
  getContinuousCornerStyle,
  getInsetCardStyle,
} from "../../components/ui/shared-styles";
import { selectIsTaskCancelling } from "../../features/download/selectors";
import type {
  AdvancedQualityOption,
  DownloadQueueState,
  DownloadTask,
} from "../../features/download/model";
import type { VideoTranscodeTaskPayload } from "../../protocol/download/ipcTypes";
import {
  getTranscodeTaskStatusText,
  getVideoTranscodeFormatLabel,
  getVideoTranscodeTaskProgressPercent,
} from "../../utils/downloadViewHelpers";
import {
  getDownloadQueueTaskProgressPercent,
  getDownloadQueueTaskProgressText,
} from "./mainWindowQueueTaskProgress";

export type MainWindowQueuePopoverProps = {
  visible: boolean;
  showBadge: boolean;
  isOpen: boolean;
  onToggleOpen: () => void;
  totalTaskCount: number;
  downloadQueueTasks: DownloadTask[];
  totalDownloadTaskCount: number;
  downloadState: DownloadQueueState;
  transcodeQueueTasks: VideoTranscodeTaskPayload[];
  totalTranscodeTaskCount: number;
  pendingTranscodeActionTraceIds: readonly string[];
  isAdvancedQualitySelectionPopover: boolean;
  advancedQualitySelectionTask: DownloadTask | null;
  mainWindowFullContentVisible: boolean;
  getAdvancedQualityTaskTitle: (task: DownloadTask) => string;
  renderAdvancedQualityOptionButton: (
    task: DownloadTask,
    option: AdvancedQualityOption,
    density: "popover" | "inline",
  ) => ReactNode;
  onCancelDownload: (traceId: string) => void;
  onCancelTranscode: (traceId: string) => void;
  onRetryTranscode: (traceId: string) => void;
  onRemoveTranscode: (traceId: string) => void;
};

export const MainWindowQueuePopover = forwardRef<
  HTMLButtonElement,
  MainWindowQueuePopoverProps
>(function MainWindowQueuePopover(props, badgeButtonRef) {
  const { colors } = useTheme();
  const { t, i18n } = useTranslation("desktop");
  const { downloadState } = props;

  const queueViewMeta = [
    props.totalDownloadTaskCount > 0
      ? t("app.queue.downloadCountSummary", { count: props.totalDownloadTaskCount })
      : null,
    props.totalTranscodeTaskCount > 0
      ? t("app.queue.transcodeCountSummary", { count: props.totalTranscodeTaskCount })
      : null,
  ].filter(Boolean).join(" · ");
  const hasDownloadTasks = props.totalDownloadTaskCount > 0;
  const hasTranscodeTasks = props.totalTranscodeTaskCount > 0;

  if (!props.visible) {
    return null;
  }

  return (
    <>
      {props.showBadge ? (
        <button
          ref={badgeButtonRef}
          onClick={props.onToggleOpen}
          onMouseDown={(e) => e.stopPropagation()}
          style={{
            position: "absolute",
            top: 10,
            left: 10,
            minWidth: 42,
            height: 30,
            borderRadius: 15,
            padding: "0 10px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            background: props.isOpen
              ? `linear-gradient(180deg, ${colors.fieldBg} 0%, ${colors.bgSecondary} 100%)`
              : `linear-gradient(180deg, ${colors.fieldBg} 0%, ${colors.bgPrimary} 100%)`,
            color: colors.textPrimary,
            border: `1px solid ${props.isOpen ? colors.queueStatusBorder : colors.fieldBorder}`,
            fontSize: 12,
            fontWeight: 800,
            lineHeight: 1,
            userSelect: "none",
            zIndex: 30,
            boxShadow: `inset 0 0 0 1px ${props.isOpen ? colors.queueStatusBorder : colors.borderStart}, ${colors.panelShadow}`,
            backdropFilter: "blur(12px)",
            cursor: "pointer",
            transition: "background 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease",
          }}
          aria-pressed={props.isOpen}
          aria-label={t("app.queue.currentTasksAria", { count: props.totalTaskCount })}
          title={props.isOpen ? t("app.queue.closeList") : t("app.queue.showList")}
        >
          <span style={{ pointerEvents: "none" }}>{props.totalTaskCount}</span>
          <span style={{ display: "flex", alignItems: "center", gap: 4, pointerEvents: "none" }}>
            {hasDownloadTasks ? (
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  backgroundColor: colors.progressFgStroke,
                  boxShadow: `0 0 10px ${colors.progressFgStroke}`,
                  flexShrink: 0,
                }}
              />
            ) : null}
            {hasTranscodeTasks ? (
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  backgroundColor: colors.transcodeSolid,
                  boxShadow: `0 0 10px ${colors.transcodeGlow}`,
                  flexShrink: 0,
                }}
              />
            ) : null}
          </span>
        </button>
      ) : null}

      <AnimatePresence>
        {props.isOpen ? (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.98, filter: "blur(2px)" }}
            animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
            exit={{ opacity: 0, y: 8, scale: 0.98, filter: "blur(2px)" }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            style={{
              position: "absolute",
              inset: 0,
              padding: props.isAdvancedQualitySelectionPopover ? "10px" : "48px 10px 10px",
              ...getContinuousCornerStyle(props.mainWindowFullContentVisible ? 16 : 100),
              display: "flex",
              flexDirection: "column",
              gap: 6,
              background: `linear-gradient(180deg, ${colors.bgGradientStart} 0%, ${colors.bgGradientEnd} 100%)`,
              boxShadow: `inset 0 0 0 1px ${colors.queueBadgeBorder}, inset 0 0 18px ${colors.queueStatusBg}`,
              backdropFilter: "blur(16px)",
              zIndex: 25,
            }}
            data-panel-double-click="ignore"
            onMouseDown={(e) => e.stopPropagation()}
          >
            {props.isAdvancedQualitySelectionPopover && props.advancedQualitySelectionTask ? (
              <div
                style={{
                  flex: 1,
                  minHeight: 0,
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 3 }}>
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 750,
                        lineHeight: 1.1,
                        color: colors.textPrimary,
                        userSelect: "none",
                      }}
                    >
                      {t("app.queue.selectAdvancedQuality")}
                    </span>
                    <span
                      title={props.getAdvancedQualityTaskTitle(props.advancedQualitySelectionTask)}
                      style={{
                        fontSize: 10,
                        lineHeight: 1.2,
                        color: colors.textSecondary,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        userSelect: "none",
                      }}
                    >
                      {props.getAdvancedQualityTaskTitle(props.advancedQualitySelectionTask)}
                    </span>
                  </div>
                  <button
                    onClick={() => {
                      props.onCancelDownload(props.advancedQualitySelectionTask!.traceId);
                    }}
                    onMouseDown={(e) => e.stopPropagation()}
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: "50%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      border: `1px solid ${colors.fieldBorder}`,
                      backgroundColor: colors.fieldBg,
                      cursor: "pointer",
                      flexShrink: 0,
                    }}
                    title={t("app.queue.cancelTask")}
                  >
                    <svg
                      width="10"
                      height="10"
                      viewBox="0 0 10 10"
                      style={{ color: colors.progressCancelIcon }}
                    >
                      <path
                        d="M2 2L8 8M8 2L2 8"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                      />
                    </svg>
                  </button>
                </div>

                <div
                  className="hide-scrollbar"
                  style={{
                    flex: 1,
                    minHeight: 0,
                    overflowY: "auto",
                    display: "flex",
                    flexDirection: "column",
                    gap: 6,
                  }}
                >
                  {props.advancedQualitySelectionTask.qualityOptions?.map((option) => (
                    props.renderAdvancedQualityOptionButton(
                      props.advancedQualitySelectionTask!,
                      option,
                      "popover",
                    )
                  ))}
                </div>
              </div>
            ) : null}

            <div
              style={{
                display: props.isAdvancedQualitySelectionPopover ? "none" : "flex",
                flexDirection: "column",
                gap: 4,
                padding: "0 4px 2px",
              }}
            >
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: colors.textPrimary,
                  lineHeight: 1,
                  userSelect: "none",
                }}
              >
                {t("app.queue.label")}
              </span>
              {queueViewMeta ? (
                <span
                  style={{
                    fontSize: 9,
                    color: colors.textSecondary,
                    lineHeight: 1.2,
                    userSelect: "none",
                  }}
                >
                  {queueViewMeta}
                </span>
              ) : null}
            </div>

            <div
              className="hide-scrollbar"
              style={{
                flex: 1,
                minHeight: 0,
                overflowY: "auto",
                display: props.isAdvancedQualitySelectionPopover ? "none" : "flex",
                flexDirection: "column",
                gap: 6,
                paddingRight: 2,
              }}
            >
              {hasDownloadTasks ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 8,
                      padding: "0 4px",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                      <span
                        style={{
                          width: 6,
                          height: 6,
                          borderRadius: "50%",
                          backgroundColor: colors.progressFgStroke,
                          boxShadow: `0 0 8px ${colors.progressFgStroke}`,
                          flexShrink: 0,
                        }}
                      />
                      <span
                        style={{
                          fontSize: 9,
                          fontWeight: 700,
                          color: colors.textPrimary,
                          lineHeight: 1,
                          userSelect: "none",
                        }}
                      >
                        {t("app.queue.downloadSection")}
                      </span>
                    </div>
                    <span
                      style={{
                        fontSize: 8,
                        color: colors.textSecondary,
                        lineHeight: 1,
                        userSelect: "none",
                      }}
                    >
                      {props.totalDownloadTaskCount}
                    </span>
                  </div>

                  {props.downloadQueueTasks.map((task) => {
                    const isTaskCancelling = selectIsTaskCancelling(downloadState, task.traceId);
                    return (
                      <div
                        key={task.traceId}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          padding: "8px 9px",
                          ...getInsetCardStyle(colors),
                        }}
                      >
                        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 6 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <span
                              style={{
                                width: 6,
                                height: 6,
                                borderRadius: "50%",
                                flexShrink: 0,
                                backgroundColor: task.status === "pending"
                                  ? colors.accentBorder
                                  : colors.progressFgStroke,
                                boxShadow: task.status === "pending"
                                  ? `0 0 8px ${colors.accentGlow}`
                                  : `0 0 10px ${colors.progressFgStroke}`,
                              }}
                            />
                            <span
                              title={task.label}
                              style={{
                                fontSize: 10,
                                lineHeight: 1.2,
                                color: colors.textPrimary,
                                whiteSpace: "nowrap",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                              }}
                            >
                              {task.label}
                            </span>
                          </div>
                          <div
                            style={{
                              width: "100%",
                              height: 6,
                              borderRadius: 999,
                              background: `linear-gradient(90deg, ${colors.bgGradientStart} 0%, ${colors.bgGradientEnd} 100%)`,
                              overflow: "hidden",
                              boxShadow: `inset 0 0 0 1px ${colors.borderStart}`,
                            }}
                          >
                            <div
                              style={{
                                width: `${getDownloadQueueTaskProgressPercent(downloadState, task)}%`,
                                height: "100%",
                                borderRadius: 999,
                                background: task.status === "pending"
                                  ? `linear-gradient(90deg, ${colors.accentBorder} 0%, ${colors.progressText} 100%)`
                                  : `linear-gradient(90deg, ${colors.progressFgStroke} 0%, ${colors.progressText} 100%)`,
                                boxShadow: task.status === "pending"
                                  ? `0 0 12px ${colors.accentGlow}`
                                  : `0 0 12px ${colors.progressFgStroke}`,
                                transition: "width 0.2s ease",
                              }}
                            />
                          </div>
                          <span style={{ fontSize: 9, lineHeight: 1.1, color: colors.textSecondary }}>
                            {getDownloadQueueTaskProgressText(t, downloadState, task)}
                          </span>
                          {task.phase === "selecting_quality" && task.qualityOptions?.length ? (
                            <div
                              style={{
                                display: "flex",
                                flexDirection: "column",
                                gap: 5,
                              }}
                            >
                              {task.qualityOptions.map((option) => (
                                props.renderAdvancedQualityOptionButton(task, option, "inline")
                              ))}
                            </div>
                          ) : null}
                        </div>
                        <button
                          onClick={() => {
                            props.onCancelDownload(task.traceId);
                          }}
                          onMouseDown={(e) => e.stopPropagation()}
                          disabled={isTaskCancelling}
                          style={{
                            width: 24,
                            height: 24,
                            borderRadius: "50%",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            border: "none",
                            backgroundColor: isTaskCancelling
                              ? colors.queueStatusBg
                              : "transparent",
                            cursor: isTaskCancelling ? "default" : "pointer",
                            opacity: isTaskCancelling ? 0.6 : 1,
                            flexShrink: 0,
                            transition: "background-color 0.2s ease",
                          }}
                          title={isTaskCancelling ? t("app.queue.cancellingTask") : t("app.queue.cancelTask")}
                        >
                          <svg
                            width="10"
                            height="10"
                            viewBox="0 0 10 10"
                            style={{ color: colors.progressCancelIcon, transition: "color 0.2s" }}
                          >
                            <path
                              d="M2 2L8 8M8 2L2 8"
                              stroke="currentColor"
                              strokeWidth="1.5"
                              strokeLinecap="round"
                            />
                          </svg>
                        </button>
                      </div>
                    );
                  })}
                </div>
              ) : null}

              {hasTranscodeTasks ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 8,
                      padding: "0 4px",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                      <span
                        style={{
                          width: 6,
                          height: 6,
                          borderRadius: "50%",
                          backgroundColor: colors.transcodeSolid,
                          boxShadow: `0 0 8px ${colors.transcodeGlow}`,
                          flexShrink: 0,
                        }}
                      />
                      <span
                        style={{
                          fontSize: 9,
                          fontWeight: 700,
                          color: colors.textPrimary,
                          lineHeight: 1,
                          userSelect: "none",
                        }}
                      >
                        {t("app.queue.transcodeSection")}
                      </span>
                    </div>
                    <span
                      style={{
                        fontSize: 8,
                        color: colors.textSecondary,
                        lineHeight: 1,
                        userSelect: "none",
                      }}
                    >
                      {props.totalTranscodeTaskCount}
                    </span>
                  </div>

                  {props.transcodeQueueTasks.map((task) => {
                    const isFailedTask = task.status === "failed";
                    const isTaskActionPending = props.pendingTranscodeActionTraceIds.includes(task.traceId);
                    const formatLabel = getVideoTranscodeFormatLabel(task);
                    const markerColor = isFailedTask ? colors.dangerSolid : colors.transcodeSolid;
                    const markerGlow = isFailedTask ? colors.dangerGlow : colors.transcodeGlow;
                    const taskStatusText = isTaskActionPending
                      ? t("app.queue.cancellingTranscode")
                      : getTranscodeTaskStatusText(i18n.t, task);

                    return (
                      <div
                        key={task.traceId}
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: 7,
                          padding: "8px 9px",
                          ...getInsetCardStyle(colors, isFailedTask ? colors.dangerBorder : colors.borderStart),
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                          <span
                            style={{
                              width: 6,
                              height: 6,
                              borderRadius: "50%",
                              flexShrink: 0,
                              backgroundColor: markerColor,
                              boxShadow: `0 0 10px ${markerGlow}`,
                            }}
                          />
                          <span
                            title={task.label}
                            style={{
                              flex: 1,
                              minWidth: 0,
                              fontSize: 10,
                              lineHeight: 1.2,
                              color: colors.textPrimary,
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                            }}
                          >
                            {task.label}
                          </span>
                          {formatLabel ? (
                            <span
                              style={{
                                maxWidth: 76,
                                padding: "2px 5px",
                                borderRadius: 999,
                                fontSize: 8,
                                lineHeight: 1,
                                color: colors.transcodeText,
                                backgroundColor: colors.transcodeSurface,
                                border: `1px solid ${colors.transcodeBorder}`,
                                whiteSpace: "nowrap",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                userSelect: "none",
                              }}
                              title={formatLabel}
                            >
                              {formatLabel}
                            </span>
                          ) : null}
                        </div>

                        <div
                          style={{
                            width: "100%",
                            height: 6,
                            borderRadius: 999,
                            background: `linear-gradient(90deg, ${colors.bgGradientStart} 0%, ${colors.bgGradientEnd} 100%)`,
                            overflow: "hidden",
                            boxShadow: `inset 0 0 0 1px ${colors.borderStart}`,
                          }}
                        >
                          <div
                            style={{
                              width: `${getVideoTranscodeTaskProgressPercent(task)}%`,
                              height: "100%",
                              borderRadius: 999,
                              background: `linear-gradient(90deg, ${colors.transcodeSolid} 0%, ${colors.transcodeText} 100%)`,
                              boxShadow: `0 0 12px ${colors.transcodeGlow}`,
                              opacity: isFailedTask ? 0.7 : 1,
                              transition: "width 0.2s ease",
                            }}
                          />
                        </div>

                        <div style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: "space-between" }}>
                          <span
                            title={isTaskActionPending ? undefined : task.error ?? undefined}
                            style={{
                              flex: 1,
                              minWidth: 0,
                              fontSize: 9,
                              lineHeight: 1.1,
                              color: isFailedTask ? colors.dangerText : colors.textSecondary,
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                            }}
                          >
                            {taskStatusText}
                          </span>

                          {isFailedTask ? (
                            <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
                              <button
                                onClick={() => {
                                  props.onRetryTranscode(task.traceId);
                                }}
                                onMouseDown={(e) => e.stopPropagation()}
                                disabled={isTaskActionPending}
                                style={{
                                  border: `1px solid ${colors.transcodeBorder}`,
                                  backgroundColor: colors.transcodeSurface,
                                  color: colors.transcodeText,
                                  borderRadius: 999,
                                  padding: "2px 7px",
                                  fontSize: 8,
                                  lineHeight: 1.2,
                                  cursor: isTaskActionPending ? "default" : "pointer",
                                  opacity: isTaskActionPending ? 0.6 : 1,
                                }}
                                title={t("app.queue.retryTranscode")}
                              >
                                {t("app.queue.retryTranscode")}
                              </button>
                              <button
                                onClick={() => {
                                  props.onRemoveTranscode(task.traceId);
                                }}
                                onMouseDown={(e) => e.stopPropagation()}
                                disabled={isTaskActionPending}
                                style={{
                                  border: `1px solid ${colors.fieldBorder}`,
                                  backgroundColor: colors.fieldBg,
                                  color: colors.textSecondary,
                                  borderRadius: 999,
                                  padding: "2px 7px",
                                  fontSize: 8,
                                  lineHeight: 1.2,
                                  cursor: isTaskActionPending ? "default" : "pointer",
                                  opacity: isTaskActionPending ? 0.6 : 1,
                                }}
                                title={t("app.queue.removeTranscodeHint")}
                              >
                                {t("app.queue.removeTranscode")}
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => {
                                props.onCancelTranscode(task.traceId);
                              }}
                              onMouseDown={(e) => e.stopPropagation()}
                              disabled={isTaskActionPending}
                              style={{
                                width: 24,
                                height: 24,
                                borderRadius: "50%",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                border: "none",
                                backgroundColor: isTaskActionPending
                                  ? colors.queueStatusBg
                                  : "transparent",
                                cursor: isTaskActionPending ? "default" : "pointer",
                                opacity: isTaskActionPending ? 0.6 : 1,
                                flexShrink: 0,
                                transition: "background-color 0.2s ease",
                              }}
                              title={isTaskActionPending ? t("app.queue.cancellingTranscode") : t("app.queue.cancelTranscode")}
                            >
                              <svg
                                width="10"
                                height="10"
                                viewBox="0 0 10 10"
                                style={{ color: colors.progressCancelIcon, transition: "color 0.2s" }}
                              >
                                <path
                                  d="M2 2L8 8M8 2L2 8"
                                  stroke="currentColor"
                                  strokeWidth="1.5"
                                  strokeLinecap="round"
                                />
                              </svg>
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  );
});
