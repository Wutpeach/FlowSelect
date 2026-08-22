/**
 * Browser Lab preview stage — mounts the ONE production
 * ExpandedPresentationSurface plus the shared production DOM overlays exactly
 * as the Electron main window composes them (center overlay, queue badge /
 * popover, runtime indicator). The surface target is always the production
 * ExpandedPresentationTarget; overlay inputs come from the projected Lab
 * fixture (or none for pure activation/progress scenes). The Lab never
 * re-implements a renderer, runtime, shader, or overlay.
 */
import {
  useCallback,
  useLayoutEffect,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";
import { useTranslation } from "react-i18next";
import { getPanelShellStyle } from "../components/ui/shared-styles";
import {
  MAIN_WINDOW_FULL_SHADOW_GUTTER,
  MAIN_WINDOW_PANEL_SIZE,
} from "../constants/windowMetrics";
import { useTheme } from "../contexts/ThemeContext";
import { ExpandedPresentationSurface } from "../presentation/main-window/ExpandedPresentationSurface";
import { MAIN_WINDOW_FULL_PANEL_RADIUS } from "../presentation/main-window/geometry";
import { THERMAL_PALETTE } from "../presentation/main-window/thermalPalette";
import { MainWindowCenterOverlay } from "../presentation/main-window/MainWindowCenterOverlay";
import { MainWindowQueuePopover } from "../presentation/main-window/MainWindowQueuePopover";
import { MainWindowRuntimeIndicator } from "../presentation/main-window/MainWindowRuntimeIndicator";
import type { MainWindowQueuePopoverProps } from "../presentation/main-window/MainWindowQueuePopover";
import type { ExpandedPresentationTarget } from "../presentation/main-window/expandedPresentationTargets";
import type { ErrorDiagnosticCopyRequest } from "../types/errorDiagnostics";
import type { LabOverlayProjection } from "./overlayProjection";
import { LAB_PREVIEW_SIZE } from "./scenarios";

export type LabOverlayStageProps = {
  target: ExpandedPresentationTarget;
  reducedMotion: boolean;
  /**
   * Lab-only Heatmap spike flag; forwarded to the one production surface so
   * the single shader draws the moving heat field over the full preview.
   */
  heatmapMode: boolean;
  /**
   * Lab-only Thermal Refraction spike flag (derived Heatmap mode); forwarded
   * to the one production surface so the single shader applies the slow local
   * refraction displacement to the same analytic heat field.
   */
  refractionMode: boolean;
  /** Lab-only accepted-contact response plus 14px outer-domain evidence. */
  boundaryHaloMode: boolean;
  /** Non-null when a seven-scenario overlay fixture is active. */
  overlayProjection: LabOverlayProjection | null;
  /** Show the queue badge/popover inside the preview frame. */
  showQueueOverlay: boolean;
  queueOpen: boolean;
  onQueueOpenChange: (open: boolean) => void;
  /** Show the runtime indicator inside the preview frame. */
  showRuntimeOverlay: boolean;
  runtimeHovered: boolean;
  onRuntimeHoverChange: (hovered: boolean) => void;
  /** Inspector-owned no-op affordances (never issue commands). */
  onCancelPrimaryTask: (traceId: string) => void;
  onCopyDiagnostic: (diagnostic: ErrorDiagnosticCopyRequest) => void;
  onRecheck: () => void;
  /** Origin marker for activation scenes. */
  pointerOriginX: number;
  pointerOriginY: number;
  onPreviewClick: (point: { clientX: number; clientY: number; rect: DOMRect }) => void;
  /**
   * Backing-store scale for the ONE production canvas during a PNG export
   * (undefined = unchanged, normal clamped devicePixelRatio). Raised to 4 so
   * readPixels captures an exactly-800x800 frame while the 200x200 CSS layout
   * stays fixed, independent of devicePixelRatio.
   */
  captureScale?: number;
  /**
   * Redraw epoch: bumped per capture request so the surface re-draws (and the
   * readback re-reads) even when captureScale is unchanged (scale-1 reference).
   */
  captureEpoch: number;
  /** Resolved by WebglReadback in the same commit as the surface redraw. */
  onWebglReadback: (result: WebglReadbackResult | null) => void;
};

/**
 * Same-commit WebGL readback: registered as a sibling AFTER the production
 * surface so its layout effect runs after the surface's backingScale redraw and
 * can read the freshly drawn backing buffer (preserveDrawingBuffer=false)
 * before the browser composites.
 */
export type WebglReadbackResult = {
  width: number;
  height: number;
  pixels: Uint8Array;
};

export function WebglReadback({
  captureEpoch,
  onResult,
}: {
  captureEpoch: number;
  onResult: (result: WebglReadbackResult | null) => void;
}) {
  useLayoutEffect(() => {
    if (captureEpoch <= 0) {
      return;
    }
    const canvas = document.querySelector<HTMLCanvasElement>(
      "[data-lab-preview-frame] canvas",
    );
    if (!(canvas instanceof HTMLCanvasElement)) {
      onResult(null);
      return;
    }
    const gl = canvas.getContext("webgl2");
    if (gl === null) {
      onResult(null);
      return;
    }
    const width = canvas.width;
    const height = canvas.height;
    if (width <= 0 || height <= 0) {
      onResult(null);
      return;
    }
    const pixels = new Uint8Array(width * height * 4);
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    onResult({ width, height, pixels });
  }, [captureEpoch, onResult]);
  return null;
}

const PREVIEW_FRAME_STYLE: CSSProperties = {
  position: "relative",
  width: LAB_PREVIEW_SIZE,
  height: LAB_PREVIEW_SIZE,
  overflow: "hidden",
  borderRadius: 14,
  background: "#1b1920",
  boxShadow: "0 0 0 1px #332e3f, 0 10px 30px rgba(0,0,0,0.5)",
  cursor: "crosshair",
  flexShrink: 0,
};

const OUTER_DOMAIN_SIZE =
  MAIN_WINDOW_PANEL_SIZE + MAIN_WINDOW_FULL_SHADOW_GUTTER * 2;

export function LabOverlayStage(props: LabOverlayStageProps) {
  const { t } = useTranslation("lab");
  const { colors } = useTheme();
  const {
    target,
    reducedMotion,
    heatmapMode,
    refractionMode,
    boundaryHaloMode,
    overlayProjection,
    showQueueOverlay,
    queueOpen,
    onQueueOpenChange,
    showRuntimeOverlay,
    runtimeHovered,
    onRuntimeHoverChange,
    onCancelPrimaryTask,
    onCopyDiagnostic,
    onRecheck,
    pointerOriginX,
    pointerOriginY,
    onPreviewClick,
    captureScale,
    captureEpoch,
    onWebglReadback,
  } = props;

  const handlePreviewClick = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
    onPreviewClick({
      clientX: event.clientX,
      clientY: event.clientY,
      rect: event.currentTarget.getBoundingClientRect(),
    });
  }, [onPreviewClick]);

  const getAdvancedQualityTaskTitle = useCallback((task: { label: string }) => task.label, []);
  const renderAdvancedQualityOptionButton = useCallback((): ReactNode => null, []);

  const queueOverlayProps: MainWindowQueuePopoverProps | null = overlayProjection !== null && showQueueOverlay
    ? {
        visible: true,
        showBadge: true,
        isOpen: queueOpen,
        onToggleOpen: () => onQueueOpenChange(!queueOpen),
        totalTaskCount: overlayProjection.totalTaskCount,
        downloadQueueTasks: overlayProjection.downloadQueueTasks,
        totalDownloadTaskCount: overlayProjection.totalDownloadTaskCount,
        downloadState: overlayProjection.downloadState,
        transcodeQueueTasks: overlayProjection.transcodeQueueTasks,
        totalTranscodeTaskCount: overlayProjection.totalTranscodeTaskCount,
        pendingTranscodeActionTraceIds: [],
        isAdvancedQualitySelectionPopover: false,
        advancedQualitySelectionTask: null,
        mainWindowFullContentVisible: true,
        getAdvancedQualityTaskTitle,
        renderAdvancedQualityOptionButton,
        onCancelDownload: () => undefined,
        onCancelTranscode: () => undefined,
        onRetryTranscode: () => undefined,
        onRemoveTranscode: () => undefined,
      }
    : null;

  const panelContents = (
    <>
      {overlayProjection !== null && overlayProjection.centerOverlayVisual.kind !== "none" ? (
        <MainWindowCenterOverlay
          centerOverlayVisual={overlayProjection.centerOverlayVisual}
          primaryTask={overlayProjection.primaryTask}
          primaryTaskStatusText={overlayProjection.primaryTaskStatusText}
          primaryTaskSummaryText={overlayProjection.primaryTaskSummaryText}
          onCopyDiagnostic={onCopyDiagnostic}
          showPrimaryCancel={overlayProjection.showPrimaryCancel}
          isPrimaryCancelPending={overlayProjection.isPrimaryCancelPending}
          primaryTaskTraceId={overlayProjection.primaryTaskTraceId}
          onCancelPrimaryTask={onCancelPrimaryTask}
        />
      ) : null}

      {queueOverlayProps !== null ? <MainWindowQueuePopover {...queueOverlayProps} /> : null}

      {overlayProjection !== null && showRuntimeOverlay ? (
        <MainWindowRuntimeIndicator
          visible
          showSuccess={overlayProjection.showRuntimeSuccess}
          isHovered={runtimeHovered}
          onHoverChange={onRuntimeHoverChange}
          headline={overlayProjection.runtimeHeadline}
          statusText={overlayProjection.runtimeStatusText}
          footerText={overlayProjection.runtimeFooterText}
          title={overlayProjection.runtimeTitle}
          progressPercent={overlayProjection.runtimeProgressPercent}
          isIndeterminate={overlayProjection.runtimeIsIndeterminate}
          shouldRenderRing={overlayProjection.runtimeShouldRenderRing}
          requiresManualAction={overlayProjection.runtimeRequiresManualAction}
          reducedMotion={reducedMotion}
          isRetryInFlight={false}
          isRetryFeedbackVisible={false}
          onRecheck={onRecheck}
        />
      ) : null}

      <div
        data-lab-chrome=""
        style={{
          position: "absolute",
          left: `${pointerOriginX * 100}%`,
          top: `${pointerOriginY * 100}%`,
          width: 16,
          height: 16,
          marginLeft: -8,
          marginTop: -8,
          borderRadius: "50%",
          border: "1px solid rgba(255,255,255,0.9)",
          boxShadow: "0 0 0 1px rgba(0,0,0,0.6)",
          pointerEvents: "none",
          zIndex: 5,
        }}
        aria-hidden="true"
      />
    </>
  );

  return (
    <div
      style={{
        ...PREVIEW_FRAME_STYLE,
        width: boundaryHaloMode ? OUTER_DOMAIN_SIZE : LAB_PREVIEW_SIZE,
        height: boundaryHaloMode ? OUTER_DOMAIN_SIZE : LAB_PREVIEW_SIZE,
        borderRadius: boundaryHaloMode ? 0 : PREVIEW_FRAME_STYLE.borderRadius,
        background: boundaryHaloMode ? "transparent" : PREVIEW_FRAME_STYLE.background,
        boxShadow: boundaryHaloMode ? "none" : PREVIEW_FRAME_STYLE.boxShadow,
      }}
      data-lab-preview-frame=""
      data-lab-outer-domain={boundaryHaloMode ? "true" : "false"}
      onClick={boundaryHaloMode ? undefined : handlePreviewClick}
      title={t("preview.clickToSetOrigin")}
    >
      {boundaryHaloMode ? (
        <div
          data-lab-panel-shell=""
          style={{
            position: "absolute",
            left: MAIN_WINDOW_FULL_SHADOW_GUTTER,
            top: MAIN_WINDOW_FULL_SHADOW_GUTTER,
            width: MAIN_WINDOW_PANEL_SIZE,
            height: MAIN_WINDOW_PANEL_SIZE,
            zIndex: 0,
            ...getPanelShellStyle(colors, {
              radius: MAIN_WINDOW_FULL_PANEL_RADIUS,
              boxShadow: colors.panelShadow,
            }),
          }}
        />
      ) : null}

      <ExpandedPresentationSurface
        eligible
        reducedMotion={reducedMotion}
        target={target}
        palette={THERMAL_PALETTE}
        heatmap={heatmapMode}
        refraction={refractionMode}
        boundaryHalo={boundaryHaloMode}
        backingScale={captureScale}
        redrawEpoch={captureEpoch}
      />
      <WebglReadback captureEpoch={captureEpoch} onResult={onWebglReadback} />

      {boundaryHaloMode ? (
        <div
          data-lab-panel-clip=""
          onClick={handlePreviewClick}
          style={{
            position: "absolute",
            left: MAIN_WINDOW_FULL_SHADOW_GUTTER,
            top: MAIN_WINDOW_FULL_SHADOW_GUTTER,
            width: MAIN_WINDOW_PANEL_SIZE,
            height: MAIN_WINDOW_PANEL_SIZE,
            borderRadius: MAIN_WINDOW_FULL_PANEL_RADIUS,
            overflow: "hidden",
            background: "none",
            boxShadow: "none",
            pointerEvents: "auto",
            zIndex: 3,
          }}
        >
          {panelContents}
        </div>
      ) : panelContents}
    </div>
  );
}
