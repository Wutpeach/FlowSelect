/**
 * Ameow UI Lab — development-only Presentation Playground (Layout & Interaction
 * Repair, final Workspace pass).
 *
 * Exactly two first-level surfaces, sharing one surface language:
 *   1. Workspace Shell (dominant): ONE outer boundary with three internal
 *      regions — Header (centered, spacious, curated scenario set), Body (the
 *      dominant Preview on a Preview-local Dark/Light/Checkerboard environment
 *      layer with comfortable Auto breathing room), and Footer (Target /
 *      Auto/1x/2x/3x / context actions, separated by hairlines and spacing,
 *      not three large cards).
 *   2. Dev Tools (right, persistent): sectioned human-readable facts (target /
 *      scale / background / reduced motion, origin, scenario facts) with the
 *      raw composed-input / shader-readout JSON demoted to Advanced
 *      Diagnostics — same page/surface/background/typography/spacing language.
 *
 * Auto semantics: the default adaptive display scale resolves to the largest
 * comfortable member of {1, 2, 3} from the measured stage — never below 1,
 * never above 3, and the metadata is always integer (e.g. "自动 · 2×"). The
 * manual 1x/2x/3x options remain explicit overrides. Logical geometry and the
 * export backing scale are unchanged.
 *
 * Lab-only affordances: a compact Preview environment / Reset group occupies
 * the lower-left corner. Reset restores the current preview/scenario to its
 * baseline (re-apply scenario, recenter origin, Reduced Motion off) using only
 * the existing reducer actions; the origin marker is conditional
 * (origin-relevant Full scenarios or while editing origin) and never part of
 * production rendering; Replay and Export are secondary quiet controls with
 * short-lived feedback.
 *
 * Interaction language: controls reuse the repo shared-styles factories
 * (getSelectableOptionStyle / getCompactLabelStyle) with a CSS `:focus-visible`
 * ring distinct from the selected accent. No page title, no left nav, no
 * shadcn/Radix/Tailwind-in-Lab — all controls are Lab-local.
 *
 * The Lab never creates a renderer, runtime, shader, or native window: it
 * mounts the existing production renderers and inspects what they already
 * draw. Preview Target, display scale (Auto is a derived Lab-local scale), and
 * the preview background are Lab-local UI state only — never written back
 * into production, scenario, reducer, renderer, or Product state.
 */
import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { useTranslation } from "react-i18next";
import { useTheme, type ThemeColors } from "../contexts/ThemeContext";
import {
  getCompactLabelStyle,
} from "../components/ui/shared-styles";
import {
  clampNormalizedOrigin,
  composeLabInput,
  createLabPresentationState,
  LAB_COMPACT_SCENARIOS,
  reduceLabPresentation,
  resolveLabCompactScenario,
  resolveLabPreviewReducedMotion,
  type LabCompactScenario,
  type LabComposedInput,
} from "./scenarios";
import { NEUTRAL_PRESENTATION_ORIGIN } from "../presentation/main-window/downloadIntakePresentation";
import { LabOverlayStage, type WebglReadbackResult } from "./LabOverlayStage";
import { CompactPreviewStage } from "./CompactPreviewStage";
import {
  projectLabOverlayFixture,
  projectLabQueueRow,
  type LabOverlayProjection,
} from "./overlayProjection";
import {
  resolveLabOverlayFixture,
  type LabOverlayFixture,
} from "./stateFixtures";
import {
  capturePreviewPng,
  downloadCapturedPng,
  ExportLayerFailure,
} from "./exportPng";
import {
  LAB_DISPLAY_SCALES,
  LAB_DISPLAY_SCALE_DEFAULT,
  LAB_PREVIEW_TARGETS,
  resolveLabAutoDisplayScale,
  resolveLabPreviewScaledSize,
  type LabDisplayScale,
  type LabPreviewTarget,
} from "./previewTargets";
import {
  LAB_PREVIEW_ENVIRONMENT_DEFAULT,
  resolveLabPreviewEnvironmentStyle,
  type LabPreviewEnvironment,
} from "./previewEnvironment";
import { getLabChipStyle } from "./labControls";
import { LabSegmentedControl, type LabSegmentedOption } from "./LabSegmentedControl";
import { PreviewEnvironmentPicker } from "./PreviewEnvironmentPicker";

const prefersReducedMotion = (): boolean => (
  typeof window !== "undefined"
  && typeof window.matchMedia === "function"
  && window.matchMedia("(prefers-reduced-motion: reduce)").matches
);

/**
 * Live readout of the production WebGL2 program uniforms. The Lab never
 * creates a renderer, runtime, or shader: it only inspects the uniforms the
 * existing ExpandedPresentationSurface already draws, the same way the MR9
 * CDP validation harness does. This readout is FULL-only — it assumes the one
 * production canvas exists and must never run while the Compact target is
 * selected (no canvas).
 */
type ShaderReadout = {
  canvasCount: number;
  linked: boolean;
  progressMode: number;
  progress: number;
  activationKind: number;
  activationAge: number;
  activationOrigin: readonly number[];
  reducedMotion: number;
  heatmapMode: number;
  refractionMode: number;
  boundaryHaloMode: number;
  time: number;
};

/**
 * How long the export button keeps showing its success/failure label before
 * returning to the normal idle state (deliberate, short feedback interval).
 */
const EXPORT_FEEDBACK_MS = 2000;

const MISSING = -1;

const readShaderReadout = (): ShaderReadout => {
  const canvases = Array.from(document.querySelectorAll("canvas"));
  const empty: ShaderReadout = {
    canvasCount: canvases.length,
    linked: false,
    progressMode: MISSING,
    progress: MISSING,
    activationKind: MISSING,
    activationAge: MISSING,
    activationOrigin: [],
    reducedMotion: MISSING,
    heatmapMode: MISSING,
    refractionMode: MISSING,
    boundaryHaloMode: MISSING,
    time: MISSING,
  };
  const canvas = canvases[0];
  if (!(canvas instanceof HTMLCanvasElement)) {
    return empty;
  }
  const gl = canvas.getContext("webgl2");
  if (gl === null) {
    return empty;
  }
  const program = gl.getParameter(gl.CURRENT_PROGRAM);
  if (program === null) {
    return empty;
  }
  const readScalar = (name: string): number => {
    const location = gl.getUniformLocation(program, name);
    if (location === null) {
      return MISSING;
    }
    const value = gl.getUniform(program, location);
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === "boolean") {
      return value ? 1 : 0;
    }
    return MISSING;
  };
  const readVec2 = (name: string): readonly number[] => {
    const location = gl.getUniformLocation(program, name);
    if (location === null) {
      return [];
    }
    const value = gl.getUniform(program, location);
    return value instanceof Float32Array ? Array.from(value) : [];
  };
  return {
    canvasCount: canvases.length,
    linked: gl.getProgramParameter(program, gl.LINK_STATUS) === true,
    progressMode: readScalar("uProgressMode"),
    progress: readScalar("uProgress"),
    activationKind: readScalar("uActivationKind"),
    activationAge: readScalar("uActivationAge"),
    activationOrigin: readVec2("uActivationOrigin"),
    reducedMotion: readScalar("uReducedMotion"),
    heatmapMode: readScalar("uHeatmapMode"),
    refractionMode: readScalar("uRefractionMode"),
    boundaryHaloMode: readScalar("uBoundaryHaloMode"),
    time: readScalar("uTime"),
  };
};

/* ---------------------------------------------------------------------------
 * Layout styles — two macro regions:
 * left/dominant Main Workspace, right persistent Dev Tools.
 * ------------------------------------------------------------------------- */

const PAGE_STYLE: CSSProperties = {
  minHeight: "100vh",
  display: "flex",
  gap: 16,
  padding: 16,
  boxSizing: "border-box",
  background: "#141318",
  color: "#ece8f2",
  fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif",
  // Dev Tools is ALWAYS visible; a narrow window scrolls the page shell
  // horizontally instead of hiding the right region.
  overflowX: "auto",
};

const REGION_SURFACE_STYLE: CSSProperties = {
  background: "#1d1b22",
  border: "1px solid #302c3a",
  borderRadius: 12,
};

const WORKSPACE_STYLE: CSSProperties = {
  ...REGION_SURFACE_STYLE,
  flex: 1,
  minWidth: 0,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: 12,
  boxSizing: "border-box",
  padding: 14,
  minHeight: 0,
};

const DEVTOOLS_STYLE: CSSProperties = {
  ...REGION_SURFACE_STYLE,
  display: "flex",
  flexDirection: "column",
  gap: 8,
  padding: 14,
  // Clamped width: shrinks on narrow windows but is never hidden.
  width: "clamp(280px, 24vw, 400px)",
  flexShrink: 0,
  maxHeight: "calc(100vh - 32px)",
  overflowY: "auto",
  boxSizing: "border-box",
};

/** Flat scenario strip — the FIRST Main Workspace content. A small, spacious
    set of representative scenario selectors (target-aware), not a dense cloud. */
const STRIP_STYLE: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 10,
  flexWrap: "wrap",
  overflowX: "auto",
  width: "100%",
  maxWidth: 800,
  padding: "2px 0 8px",
};

/** Preview stage: a bordered environment panel that fills the workspace. */
const STAGE_WRAPPER_STYLE: CSSProperties = {
  position: "relative",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  alignSelf: "stretch",
  flex: 1,
  minHeight: 0,
  overflow: "hidden",
  borderRadius: 12,
  border: "1px solid #302c3a",
};

/** Below-preview controls: three stacked labeled groups (Display mode / Zoom /
    Actions) separated by hairlines and spacing — lightweight field surfaces,
    NOT three large cards. Width is governed by the Workspace Shell footer
    region wrapper. */
const CONTROLS_STACK_STYLE: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "stretch",
  gap: 8,
  width: "100%",
};

/** Workspace Shell Footer region: the below-preview controls + caption share
    one footer boundary (hairline-divided, no per-group card surface). */
const FOOTER_STYLE: CSSProperties = {
  width: "100%",
  maxWidth: 760,
  display: "flex",
  flexDirection: "column",
  gap: 8,
};

/** One labeled control group row (quiet label left, controls right). */
const CONTROL_GROUP_STYLE: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  flexWrap: "wrap",
};

const CONTROL_GROUP_LABEL_STYLE: CSSProperties = {
  minWidth: 96,
  userSelect: "none",
};

const TITLE_STYLE: CSSProperties = {
  margin: 0,
  fontSize: 15,
  fontWeight: 700,
  color: "#f2eff7",
};

const META_STYLE: CSSProperties = {
  fontSize: 11,
  color: "#8f89a0",
  whiteSpace: "nowrap",
};

const CAPTION_STYLE: CSSProperties = {
  fontSize: 11,
  color: "#8f89a0",
  textAlign: "center",
  lineHeight: 1.5,
};

const ROW_STYLE: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  fontSize: 12,
  color: "#d8d3e3",
};

const HINT_STYLE: CSSProperties = {
  fontSize: 10.5,
  color: "#8f89a0",
  lineHeight: 1.35,
};

const READOUT_STYLE: CSSProperties = {
  marginTop: 6,
  display: "grid",
  gap: 4,
};

const READOUT_LABEL_STYLE: CSSProperties = {
  margin: 0,
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: "#a49eb8",
};

const PRE_STYLE: CSSProperties = {
  margin: 0,
  padding: "8px 10px",
  borderRadius: 8,
  background: "#141318",
  border: "1px solid #2c2836",
  fontSize: 10.5,
  lineHeight: 1.45,
  color: "#cfc9dc",
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
};

/**
 * Low-weight icon-only Reset affordance in the Preview control group. It
 * shares the Background trigger's height / radius / surface and keeps the
 * native `title` tooltip plus `aria-label`. It only restores the CURRENT Lab
 * preview/scenario to its baseline via the existing reducer actions — no new
 * authority, no production command.
 */
const getLabResetButtonStyle = (colors: ThemeColors): CSSProperties => ({
  ...getLabChipStyle(colors),
  width: 28,
  height: 28,
  borderRadius: 8,
  color: colors.controlMuted,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 0,
});

const DISCLOSURE_STYLE: CSSProperties = {
  marginTop: 10,
  border: "1px solid #302c3a",
  borderRadius: 10,
  background: "#18161d",
  padding: "8px 10px",
};

const DISCLOSURE_SUMMARY_STYLE: CSSProperties = {
  cursor: "pointer",
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: "#a49eb8",
  userSelect: "none",
};

/** One Dev Tools section: quiet uppercase header + separator, same surface as
    Main Workspace (shared panel background / border / radius). */
const DEVTOOLS_SECTION_STYLE: CSSProperties = {
  display: "grid",
  gap: 8,
};

type TranslateFn = (key: string, options?: Record<string, unknown>) => string;

/** Scenario id -> lab-locale key (ids are kebab-case, locale keys camelCase). */
const PRESET_LABEL_KEYS: Readonly<Record<string, string>> = {
  "intake-local": "intakeLocal",
  "intake-center": "intakeCenter",
  "folder": "folder",
  "intake-reduced": "intakeReduced",
  "folder-reduced": "folderReduced",
  "progress-0": "progress0",
  "progress-25": "progress25",
  "progress-50": "progress50",
  "progress-75": "progress75",
  "progress-100": "progress100",
  "heatmap-moving": "heatmapMoving",
  "heatmap-reduced": "heatmapReduced",
  "heatmap-refraction-moving": "heatmapRefractionMoving",
  "heatmap-refraction-reduced": "heatmapRefractionReduced",
  "heatmap-contact-halo-moving": "heatmapContactHaloMoving",
  "heatmap-contact-halo-reduced": "heatmapContactHaloReduced",
  "runtime-auto-config": "runtimeAutoConfig",
  "runtime-failed": "runtimeFailed",
  "download-active": "downloadActive",
  "download-queued": "downloadQueued",
  "transcode-active": "transcodeActive",
  "transcode-failed": "transcodeFailed",
  "mixed-busy": "mixedBusy",
  "compact-neutral": "compactNeutral",
  "compact-pointer": "compactPointer",
  "compact-reduced": "compactReduced",
};

const presetLabelKey = (id: string): string => PRESET_LABEL_KEYS[id] ?? id;

const fixtureOfCategory = (fixtureId: string): LabOverlayFixture | null =>
  resolveLabOverlayFixture(fixtureId);

const formatRawFacts = (projection: LabOverlayProjection | null): string => {
  if (!projection) {
    return "{}";
  }
  const raw = projection.raw;
  return JSON.stringify(
    {
      fixtureKind: raw.fixtureKind,
      runtimePhase: raw.runtimeGate?.phase ?? null,
      runtimeProgress: raw.runtimeGate?.progressPercent ?? null,
      downloadTasks: raw.queue.order.length,
      downloadPrimaryPercent: raw.queue.progressByTrace
        ? Object.values(raw.queue.progressByTrace)[0]?.percent ?? null
        : null,
      transcodeTasks: raw.transcodeTasks.length,
      transcodeStatus: raw.transcodeTasks[0]?.status ?? null,
      centerOverlay: raw.centerOverlayState.kind,
    },
    null,
    2,
  );
};

const formatTargetMeta = (
  t: TranslateFn,
  target: LabPreviewTarget,
  scaleLabel: string,
): string => {
  if (target === "compact") {
    const meta = LAB_PREVIEW_TARGETS.compact;
    return t("workspace.metadataCompact", {
      outer: meta.logicalSize,
      shell: meta.shellSize,
      scale: scaleLabel,
    });
  }
  const meta = LAB_PREVIEW_TARGETS.full;
  return t("workspace.metadataFull", {
    size: meta.logicalSize,
    scale: scaleLabel,
  });
};

export function PresentationLab() {
  const { t } = useTranslation("lab");
  const [state, dispatch] = useReducer(
    reduceLabPresentation,
    undefined,
    () => reduceLabPresentation(
      createLabPresentationState({ reducedMotion: prefersReducedMotion() }),
      { type: "activate", presetId: "intake-local", now: performance.now() },
    ),
  );
  const [activeFixtureId, setActiveFixtureId] = useState<string | null>(null);
  // Curated scenario-strip radio selection (Lab-local UI only).
  const [activeScenarioId, setActiveScenarioId] = useState("intake");
  // One Lab-local Preview Target discriminant, separate from scenario state.
  const [target, setTarget] = useState<LabPreviewTarget>("full");
  // Display scale is Lab-local UI: "auto" (default, derived to 1/2/3) or
  // the explicit 1x/2x/3x overrides.
  const [displayScale, setDisplayScale] = useState<LabDisplayScale>(LAB_DISPLAY_SCALE_DEFAULT);
  const [compactScenarioId, setCompactScenarioId] = useState<string>(LAB_COMPACT_SCENARIOS[0].id);
  // Screen-only Preview environment (chrome layer, never renderer/export).
  const [previewBackground, setPreviewBackground] = useState<LabPreviewEnvironment>(
    LAB_PREVIEW_ENVIRONMENT_DEFAULT,
  );
  const [queueOpen, setQueueOpen] = useState(false);
  const [runtimeHovered, setRuntimeHovered] = useState(false);
  // Origin editing focus drives the conditional origin-marker policy (Lab
  // chrome only — never production rendering).
  const [originInputFocused, setOriginInputFocused] = useState(false);
  const [exportState, setExportState] = useState<"idle" | "exporting" | "success" | "failure">("idle");
  const [exportError, setExportError] = useState<string | null>(null);
  const [captureScale, setCaptureScale] = useState<number | undefined>(undefined);
  const [captureEpoch, setCaptureEpoch] = useState(0);
  const webglReadbackRef = useRef<((result: WebglReadbackResult | null) => void) | null>(null);
  const exportResetTimerRef = useRef<number | null>(null);
  const [readout, setReadout] = useState<ShaderReadout>(() => readShaderReadout());
  // Measured stage size drives the pure Auto resolution (Lab-local only).
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [stageSize, setStageSize] = useState<{ width: number; height: number } | null>(null);

  useEffect(() => {
    const node = stageRef.current;
    if (node === null || typeof ResizeObserver === "undefined") {
      return;
    }
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (rect !== undefined) {
        setStageSize({ width: rect.width, height: rect.height });
      }
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const composed = useMemo(() => composeLabInput(state), [state]);
  const overlayProjection = useMemo<LabOverlayProjection | null>(() => {
    if (activeFixtureId === null) {
      return null;
    }
    const fixture = fixtureOfCategory(activeFixtureId);
    return fixture ? projectLabOverlayFixture(fixture, t) : null;
  }, [activeFixtureId, t]);

  const activeCompactScenario = resolveLabCompactScenario(compactScenarioId);

  // The ONE Lab reducedMotion preview value driving both targets and every
  // scenario preset / control. No competing mirror state. Overlay fixtures
  // keep the toggle-only semantics they had before the Refresh.
  const previewReducedMotion = resolveLabPreviewReducedMotion(
    state,
    target,
    activeCompactScenario,
    overlayProjection !== null,
  );

  // Shader readout is FULL-only: it must never assume a canvas exists while
  // the Compact target (no canvas) is selected.
  useEffect(() => {
    if (target !== "full") {
      return;
    }
    setReadout(readShaderReadout());
    const handle = window.setInterval(() => setReadout(readShaderReadout()), 120);
    return () => window.clearInterval(handle);
  }, [target]);

  // Export feedback is deliberately short-lived: after a success or a failure
  // the button returns to its normal idle label, so repeated exports keep
  // working without a permanently stuck success/loading state.
  useEffect(() => {
    return () => {
      if (exportResetTimerRef.current !== null) {
        window.clearTimeout(exportResetTimerRef.current);
      }
    };
  }, []);

  const scheduleExportReset = useCallback(() => {
    if (exportResetTimerRef.current !== null) {
      window.clearTimeout(exportResetTimerRef.current);
    }
    exportResetTimerRef.current = window.setTimeout(() => {
      exportResetTimerRef.current = null;
      setExportState("idle");
      setExportError(null);
    }, EXPORT_FEEDBACK_MS);
  }, []);

  const { colors } = useTheme();
  const controlGroupStyle: CSSProperties = {
    ...CONTROL_GROUP_STYLE,
    // Hairline divider + spacing between footer groups — lightweight field
    // surfaces (the segmented chips carry their own), not three large cards.
    paddingTop: 10,
    borderTop: `1px solid ${colors.borderStart}`,
  };
  const controlGroupLabelStyle: CSSProperties = {
    ...CONTROL_GROUP_LABEL_STYLE,
    ...getCompactLabelStyle(colors),
  };
  const devToolsSectionStyle: CSSProperties = {
    ...DEVTOOLS_SECTION_STYLE,
    // Same hairline-divided section language as the Workspace Shell footer.
    paddingTop: 10,
    borderTop: `1px solid ${colors.borderStart}`,
  };

  const surfaceTarget = overlayProjection !== null
    ? overlayProjection.expandedTarget
    : composed.target;

  const handlePreviewClick = useCallback((point: { clientX: number; clientY: number; rect: DOMRect }) => {
    if (overlayProjection !== null) {
      return;
    }
    dispatch({
      type: "setPointerOrigin",
      origin: clampNormalizedOrigin(
        (point.clientX - point.rect.left) / point.rect.width,
        (point.clientY - point.rect.top) / point.rect.height,
      ),
    });
  }, [overlayProjection]);

  /**
   * Curated single-select scenario radio: selecting one representative
   * scenario clears the other composed dimensions (fixture / heatmap /
   * activation / progress) so the strip reads as one calm set of mutually
   * exclusive scenario selectors, like the reference. Repository authority
   * (scenarios.ts presets) stays untouched — this only curates the VISIBLE
   * selection set.
   */
  const selectScenario = useCallback((scenarioId: string) => {
    setActiveFixtureId(null);
    setQueueOpen(false);
    dispatch({ type: "clearProgress" });
    dispatch({ type: "clearHeatmap" });
    setActiveScenarioId(scenarioId);
    if (scenarioId === "intake") {
      dispatch({ type: "activate", presetId: "intake-local", now: performance.now() });
    } else if (scenarioId === "heatmap") {
      dispatch({ type: "setHeatmap", presetId: "heatmap-moving" });
    } else if (scenarioId === "download") {
      setActiveFixtureId("download-active");
    } else if (scenarioId === "transcode") {
      setActiveFixtureId("transcode-active");
    } else if (scenarioId === "mixed") {
      setActiveFixtureId("mixed-busy");
    }
  }, []);

  const selectCompactScenario = useCallback((scenarioId: string) => {
    setCompactScenarioId(scenarioId);
  }, []);

  const handleReplay = useCallback(() => {
    dispatch({ type: "replay", now: performance.now() });
  }, []);

  /**
   * Lab-local Reset (no new authority): restore the CURRENT Lab preview /
   * scenario to its baseline state — re-apply the active scenario (which
   * clears fixture / heatmap / activation / progress and re-creates its
   * baseline), recenter the pointer origin, and turn Reduced Motion off. All
   * expressed with the existing reducer actions; no new state or command.
   */
  const handleReset = useCallback(() => {
    if (target === "full") {
      selectScenario(activeScenarioId);
    } else {
      selectCompactScenario(compactScenarioId);
    }
    dispatch({ type: "setPointerOrigin", origin: NEUTRAL_PRESENTATION_ORIGIN });
    dispatch({ type: "setReducedMotion", enabled: false });
    setQueueOpen(false);
  }, [target, activeScenarioId, compactScenarioId, selectScenario, selectCompactScenario]);

  const progressPercent =
    state.progress.kind === "determinate"
      ? Math.round(state.progress.target * 100)
      : 0;

  const exportFilename = useMemo(() => {
    const scenarioSlug = activeFixtureId ?? "activation";
    return `ameow-lab-${scenarioSlug}-4x.png`;
  }, [activeFixtureId]);

  const onWebglReadback = useCallback((result: WebglReadbackResult | null) => {
    const resolve = webglReadbackRef.current;
    webglReadbackRef.current = null;
    resolve?.(result);
  }, []);

  const requestWebglReadback = useCallback(
    (scale: number): Promise<WebglReadbackResult | null> =>
      new Promise((resolve) => {
        webglReadbackRef.current = resolve;
        setCaptureScale(scale);
        // Always bump the epoch so the surface re-draws and the readback
        // re-reads even when `scale` is unchanged.
        setCaptureEpoch((epoch) => epoch + 1);
        // Safety: never let an export hang if the commit/readback is skipped.
        window.setTimeout(() => {
          if (webglReadbackRef.current === resolve) {
            webglReadbackRef.current = null;
            resolve(null);
          }
        }, 2000);
      }),
    [],
  );

  /**
   * Lab-local export transaction: raise the production canvas backing scale,
   * capture WebGL (same commit) + DOM (html2canvas at scale) + the shared
   * production shadow, then restore the scale in `finally`. The 200x200 CSS
   * layout never changes, so export is invariant across display zoom. The
   * Preview environment is a sibling chrome layer OUTSIDE the frame and is
   * never captured.
   */
  const runCapture = useCallback(async (
    scale: number,
    frameElement: HTMLElement,
    chromeElements: HTMLElement[],
  ) => {
    const webglReadback = requestWebglReadback(scale);
    try {
      return await capturePreviewPng({
        frameElement,
        chromeElements,
        scale,
        shadowCss: colors.panelShadow,
        webglReadback,
      });
    } finally {
      // Restore the backing scale (backingScale change alone re-resizes the
      // surface; no epoch bump so no stray readback fires).
      setCaptureScale(undefined);
    }
  }, [requestWebglReadback, colors]);

  const handleExport = useCallback(async () => {
    if (exportState === "exporting") {
      return;
    }
    // A pending feedback timer must never fire into a fresh export: cancel it
    // up front so a re-export started while the label still shows the previous
    // result cannot be reset to idle mid-capture.
    if (exportResetTimerRef.current !== null) {
      window.clearTimeout(exportResetTimerRef.current);
      exportResetTimerRef.current = null;
    }
    const frameElement = document.querySelector<HTMLElement>("[data-lab-preview-frame]");
    if (!frameElement) {
      setExportState("failure");
      scheduleExportReset();
      return;
    }
    const chromeElements = Array.from(
      document.querySelectorAll<HTMLElement>("[data-lab-chrome]"),
    );
    setExportState("exporting");
    setExportError(null);
    try {
      const result = await runCapture(4, frameElement, chromeElements);
      downloadCapturedPng(result.dataUrl, exportFilename);
      setExportState("success");
      scheduleExportReset();
    } catch (error) {
      console.error("Lab PNG export failed:", error);
      // A missing WebGL readback, DOM rasterization, or unresolvable shadow
      // recipe is an export failure; never download a partial PNG. Surface the
      // concrete reason to the user.
      if (error instanceof ExportLayerFailure) {
        setExportError(
          error.layer === "webgl"
            ? t("preview.exportErrorWebgl")
            : error.layer === "dom"
              ? t("preview.exportErrorDom")
              : t("preview.exportErrorShadow"),
        );
      } else {
        setExportError(
          error instanceof Error && error.message ? error.message : null,
        );
      }
      setExportState("failure");
      scheduleExportReset();
    }
  }, [exportState, exportFilename, runCapture, scheduleExportReset, t]);

  const showQueueOverlay = overlayProjection !== null
    && (
      overlayProjection.raw.fixtureKind === "download"
      || overlayProjection.raw.fixtureKind === "mixed"
      || overlayProjection.raw.fixtureKind === "transcode"
    );
  const showRuntimeOverlay = overlayProjection !== null
    && overlayProjection.raw.fixtureKind === "runtime";

  // ---- Display scale: Auto is a derived, Lab-local scale from the measured
  // stage with a proportional breathing margin (comfortable centered preview).
  // It resolves to the largest member of {1, 2, 3} that fits — never below 1,
  // never above 3; the manual 1x/2x/3x options pass through unchanged.
  const targetMeta = LAB_PREVIEW_TARGETS[target];
  const autoScale = stageSize !== null
    ? resolveLabAutoDisplayScale(stageSize.width, stageSize.height, targetMeta.logicalSize)
    : 1;
  const effectiveScale = displayScale === "auto" ? autoScale : displayScale;
  const scaledSize = resolveLabPreviewScaledSize(target, effectiveScale);
  const scaleLabel = displayScale === "auto"
    ? t("workspace.auto", { scale: autoScale })
    : `${displayScale}×`;

  const targetOptions: readonly LabSegmentedOption<LabPreviewTarget>[] = [
    { id: "full", label: t("previewTarget.full") },
    { id: "compact", label: t("previewTarget.compact") },
  ];
  const scaleOptions: readonly LabSegmentedOption<string>[] = LAB_DISPLAY_SCALES.map((scale) => ({
    id: scale === "auto" ? "auto" : String(scale),
    label: scale === "auto" ? t("workspace.autoLabel") : `${scale}×`,
  }));
  const handleScaleChange = useCallback((id: string) => {
    setDisplayScale(id === "auto" ? "auto" : (Number(id) as LabDisplayScale));
  }, []);

  // Origin-marker policy (Lab chrome only, never production): the marker is
  // visible for the origin-relevant Intake scenario, or while the user is
  // actively editing the origin fields; hidden for Heatmap / Download /
  // Transcode / Mixed / Compact.
  const originMarkerVisible = target === "full"
    && (activeScenarioId === "intake" || originInputFocused);

  return (
    <div style={PAGE_STYLE}>
      {/* ============ Main Workspace (dominant) ============ */}
      <main aria-label={t("workspace.title")} style={WORKSPACE_STYLE} data-lab-workspace="">
        {/* 1. Workspace Shell HEADER — the flat scenario strip, the FIRST
            Workspace content: centered, spacious, small curated set. */}
        <div
          style={STRIP_STYLE}
          data-lab-workspace-header=""
          data-lab-scenario-strip=""
          className="lab-scroll"
          role="group"
          aria-label={t("nav.scenarioNavigation")}
        >
          {target === "full" ? (
            <>
              <LabStripChip
                label={t("presets.intakeLocal.label")}
                selected={activeScenarioId === "intake"}
                onClick={() => selectScenario("intake")}
                dataAttributes={{ "data-lab-preset": "intake-local" }}
                title={t("presets.intakeLocal.description")}
              />
              <LabStripChip
                label={t("presets.heatmapMoving.label")}
                selected={activeScenarioId === "heatmap"}
                onClick={() => selectScenario("heatmap")}
                dataAttributes={{ "data-lab-preset": "heatmap-moving" }}
                title={t("presets.heatmapMoving.description")}
              />
              <LabStripChip
                label={t("presets.downloadActive.label")}
                selected={activeScenarioId === "download"}
                onClick={() => selectScenario("download")}
                dataAttributes={{ "data-lab-preset": "download-active" }}
                title={t("presets.downloadActive.description")}
              />
              <LabStripChip
                label={t("presets.transcodeActive.label")}
                selected={activeScenarioId === "transcode"}
                onClick={() => selectScenario("transcode")}
                dataAttributes={{ "data-lab-preset": "transcode-active" }}
                title={t("presets.transcodeActive.description")}
              />
              <LabStripChip
                label={t("presets.mixedBusy.label")}
                selected={activeScenarioId === "mixed"}
                onClick={() => selectScenario("mixed")}
                dataAttributes={{ "data-lab-preset": "mixed-busy" }}
                title={t("presets.mixedBusy.description")}
              />
            </>
          ) : (
            LAB_COMPACT_SCENARIOS.map((scenario) => (
              <LabStripChip
                key={scenario.id}
                label={t(`presets.${presetLabelKey(scenario.id)}.label`)}
                selected={compactScenarioId === scenario.id}
                onClick={() => selectCompactScenario(scenario.id)}
                dataAttributes={{ "data-lab-compact-preset": scenario.id }}
                title={t(`presets.${presetLabelKey(scenario.id)}.description`)}
              />
            ))
          )}
        </div>

        {/* 2. Workspace Shell BODY — the dominant Preview stage, on the
            Preview environment layer. The environment is a chrome sibling
            OUTSIDE the preview host: it never reaches the renderer and is
            never captured by the Full PNG export. */}
        <div
          ref={stageRef}
          style={STAGE_WRAPPER_STYLE}
          data-lab-workspace-body=""
          data-lab-stage-viewport=""
        >
          <div
            data-lab-env={previewBackground}
            aria-hidden="true"
            style={{
              position: "absolute",
              inset: 0,
              pointerEvents: "none",
              ...resolveLabPreviewEnvironmentStyle(previewBackground),
            }}
          />
          <div style={{ width: scaledSize, height: scaledSize, position: "relative" }}>
            <div
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                transform: `scale(${effectiveScale})`,
                transformOrigin: "top left",
              }}
            >
              {target === "full" ? (
                <LabOverlayStage
                  target={surfaceTarget}
                  reducedMotion={previewReducedMotion}
                  heatmapMode={state.heatmap !== null}
                  refractionMode={state.heatmap?.refraction === true}
                  boundaryHaloMode={state.heatmap?.boundaryHalo === true}
                  overlayProjection={overlayProjection}
                  showQueueOverlay={showQueueOverlay}
                  queueOpen={queueOpen}
                  onQueueOpenChange={setQueueOpen}
                  showRuntimeOverlay={showRuntimeOverlay}
                  runtimeHovered={runtimeHovered}
                  onRuntimeHoverChange={setRuntimeHovered}
                  onCancelPrimaryTask={() => undefined}
                  onCopyDiagnostic={() => undefined}
                  onRecheck={() => undefined}
                  pointerOriginX={state.pointerOrigin.x}
                  pointerOriginY={state.pointerOrigin.y}
                  originMarkerVisible={originMarkerVisible}
                  onPreviewClick={handlePreviewClick}
                  captureScale={captureScale}
                  captureEpoch={captureEpoch}
                  onWebglReadback={onWebglReadback}
                />
              ) : (
                <CompactPreviewStage
                  reducedMotion={previewReducedMotion}
                  pointerMode={activeCompactScenario?.pointerMode ?? "neutral"}
                />
              )}
            </div>
          </div>
          <div
            data-lab-preview-controls=""
            style={{
              position: "absolute",
              left: 12,
              bottom: 12,
              zIndex: 40,
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <PreviewEnvironmentPicker
              value={previewBackground}
              onChange={setPreviewBackground}
              t={t}
            />
            <button
              type="button"
              data-lab-reset=""
              onClick={handleReset}
              title={t("workspace.resetHint")}
              aria-label={t("workspace.reset")}
              className="lab-control"
              style={getLabResetButtonStyle(colors)}
            >
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M3 12a9 9 0 1 0 2.64-6.36" />
                <path d="M3 4v5h5" />
              </svg>
            </button>
          </div>
        </div>

        {/* 3. Workspace Shell FOOTER — the below-preview controls as
            hairline-divided labeled groups (Display mode / Zoom / Actions) +
            caption, sharing one footer boundary; no per-group card surface. */}
        <div style={FOOTER_STYLE} data-lab-workspace-footer="">
          <div style={CONTROLS_STACK_STYLE} data-lab-control-groups="">
            <div style={controlGroupStyle} data-lab-control-group="target">
              <span style={controlGroupLabelStyle}>{t("controls.displayMode")}</span>
              <LabSegmentedControl<LabPreviewTarget>
                options={targetOptions}
                value={target}
                onChange={setTarget}
                ariaLabel={t("workspace.targetLabel")}
              />
            </div>
            <div style={controlGroupStyle} data-lab-control-group="scale">
              <span style={controlGroupLabelStyle}>{t("controls.zoom")}</span>
              <LabSegmentedControl<string>
                options={scaleOptions}
                value={displayScale === "auto" ? "auto" : String(displayScale)}
                onChange={handleScaleChange}
                ariaLabel={t("workspace.displayScale")}
              />
              <span style={META_STYLE}>{formatTargetMeta(t, target, scaleLabel)}</span>
            </div>
            {target === "full" ? (
              <div style={controlGroupStyle} data-lab-control-group="actions">
                <span style={controlGroupLabelStyle}>{t("controls.actions")}</span>
                <>
                  <button
                    type="button"
                    data-lab-replay=""
                    onClick={handleReplay}
                    disabled={state.activation === null}
                    style={state.activation === null
                      ? getLabChipStyle(colors, { disabled: true })
                      : getLabChipStyle(colors)}
                    className="lab-control"
                  >
                    {t("presets.replay")}
                  </button>
                  <button
                    type="button"
                    data-lab-export=""
                    onClick={() => {
                      void handleExport();
                    }}
                    disabled={exportState === "exporting"}
                    style={exportState === "exporting"
                      ? getLabChipStyle(colors, { disabled: true })
                      : getLabChipStyle(colors)}
                    className="lab-control"
                    title={t("preview.exportHint")}
                  >
                    {exportState === "exporting"
                      ? t("preview.exporting")
                      : exportState === "success"
                        ? `${t("preview.exportSuccess", { name: exportFilename })} ✓`
                        : exportState === "failure"
                          ? `${t("preview.exportFailure")} ✗`
                          : t("preview.export")}
                  </button>
                  {exportState === "failure" && exportError !== null ? (
                    <span
                      style={{ fontSize: 10.5, color: "#f06272", maxWidth: 220, lineHeight: 1.35 }}
                      role="alert"
                    >
                      {exportError}
                    </span>
                  ) : null}
                </>
              </div>
            ) : null}
          </div>

          <p style={CAPTION_STYLE}>
            {target === "full" ? t("preview.caption") : t("compact.caption")}
          </p>
        </div>
      </main>

      {/* ============ Right: persistent Dev Tools ============ */}
      <aside aria-label={t("devTools.title")} style={DEVTOOLS_STYLE} data-lab-devtools="">
        <h2 style={TITLE_STYLE}>{t("devTools.title")}</h2>

        <div style={devToolsSectionStyle}>
          <h3 style={READOUT_LABEL_STYLE}>{t("devTools.target")}</h3>
          <div style={ROW_STYLE}>
            <span style={{ minWidth: 96 }}>{t("devTools.target")}</span>
            <span>{t(LAB_PREVIEW_TARGETS[target].labelKey)}</span>
          </div>
          <div style={ROW_STYLE}>
            <span style={{ minWidth: 96 }}>{t("devTools.scale")}</span>
            <span>{scaleLabel}</span>
          </div>
          <div style={ROW_STYLE}>
            <span style={{ minWidth: 96 }}>{t("devTools.background")}</span>
            <span>{t(`environment.${previewBackground}`)}</span>
          </div>
          <div style={ROW_STYLE}>
            <span style={{ minWidth: 96 }}>{t("devTools.reducedMotion")}</span>
            <span>{previewReducedMotion ? t("devTools.on") : t("devTools.off")}</span>
          </div>
        </div>

        <div style={devToolsSectionStyle}>
          <h3 style={READOUT_LABEL_STYLE}>{t("devTools.rmSection")}</h3>
          <label style={ROW_STYLE}>
            <input
              type="checkbox"
              checked={state.reducedMotion}
              onChange={(event) =>
                dispatch({ type: "setReducedMotion", enabled: event.target.checked })}
            />
            {t("inspector.reducedMotion")}
          </label>
          <span style={HINT_STYLE}>
            {t("inspector.reducedMotionHint")}
          </span>
        </div>

        {target === "compact" ? (
          <div style={devToolsSectionStyle}>
            <CompactFacts activeScenario={activeCompactScenario} t={t} />
          </div>
        ) : overlayProjection === null ? (
          <div style={devToolsSectionStyle}>
            <h3 style={READOUT_LABEL_STYLE}>{t("devTools.originSection")}</h3>
            <div style={ROW_STYLE}>
              <span style={{ minWidth: 74 }}>{t("inspector.originX")}</span>
              <input
                type="number"
                min={0}
                max={1}
                step={0.01}
                value={state.pointerOrigin.x}
                onFocus={() => setOriginInputFocused(true)}
                onBlur={() => setOriginInputFocused(false)}
                onChange={(event) =>
                  dispatch({
                    type: "setPointerOrigin",
                    origin: clampNormalizedOrigin(Number(event.target.value), state.pointerOrigin.y),
                  })}
              />
            </div>
            <div style={ROW_STYLE}>
              <span style={{ minWidth: 74 }}>{t("inspector.originY")}</span>
              <input
                type="number"
                min={0}
                max={1}
                step={0.01}
                value={state.pointerOrigin.y}
                onFocus={() => setOriginInputFocused(true)}
                onBlur={() => setOriginInputFocused(false)}
                onChange={(event) =>
                  dispatch({
                    type: "setPointerOrigin",
                    origin: clampNormalizedOrigin(state.pointerOrigin.x, Number(event.target.value)),
                  })}
              />
            </div>
            <span style={HINT_STYLE}>
              {t("inspector.originHint")}
            </span>

            <div style={ROW_STYLE}>
              <span style={{ minWidth: 74 }}>{t("inspector.determinate")}</span>
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={progressPercent}
                onChange={(event) =>
                  dispatch({ type: "progressTarget", target: Number(event.target.value) / 100 })}
                style={{ flex: 1 }}
              />
              <span style={{ minWidth: 34, textAlign: "right" }}>{progressPercent}%</span>
            </div>
            <span style={HINT_STYLE}>
              {t("inspector.determinateHint")}
            </span>
          </div>
        ) : (
          <div style={devToolsSectionStyle}>
            <h3 style={READOUT_LABEL_STYLE}>{t("inspector.scenario")}</h3>
            <ScenarioFacts
              projection={overlayProjection}
              t={t}
              queueOpen={queueOpen}
              onQueueOpenChange={setQueueOpen}
            />
          </div>
        )}

        <AdvancedDiagnostics
          target={target}
          displayScale={displayScale}
          effectiveScale={effectiveScale}
          previewEnvironment={previewBackground}
          captureScale={captureScale}
          overlayProjection={overlayProjection}
          composed={composed}
          readout={readout}
          t={t}
        />
      </aside>
    </div>
  );
}

/** Lab selection/test markers for a chip (data-* keys only, JSX-safe). */
type LabChipDataAttributes = {
  "data-lab-preset"?: string;
  "data-lab-action"?: string;
  "data-lab-compact-preset"?: string;
};

function LabStripChip({
  label,
  selected,
  onClick,
  title,
  dataAttributes,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
  title?: string;
  dataAttributes?: LabChipDataAttributes;
}) {
  const { colors } = useTheme();
  const [hovered, setHovered] = useState(false);
  return (
    <button
      type="button"
      className="lab-control"
      {...(dataAttributes ?? {})}
      aria-pressed={selected}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        ...getLabChipStyle(colors, { selected, hovered }),
        // Comfortably sized scenario selector (spacious, like the reference).
        minHeight: 36,
        padding: "8px 16px",
        fontSize: 12.5,
        borderRadius: 9,
        fontWeight: selected ? 700 : 500,
      }}
      title={title}
    >
      {label}
    </button>
  );
}

/**
 * Advanced Diagnostics — the raw JSON blocks (composed input + live shader
 * readout) demoted behind a collapsible disclosure, plus Lab geometry facts
 * (including the resolved Auto scale and the screen-only preview environment).
 * Shader readout is FULL-only: on the Compact target it explains why the raw
 * blocks are unavailable instead of rendering stale/empty JSON.
 */
function AdvancedDiagnostics({
  target,
  displayScale,
  effectiveScale,
  previewEnvironment,
  captureScale,
  overlayProjection,
  composed,
  readout,
  t,
}: {
  target: LabPreviewTarget;
  displayScale: LabDisplayScale;
  effectiveScale: number;
  previewEnvironment: LabPreviewEnvironment;
  captureScale: number | undefined;
  overlayProjection: LabOverlayProjection | null;
  composed: LabComposedInput;
  readout: ShaderReadout;
  t: TranslateFn;
}) {
  const targetMeta = LAB_PREVIEW_TARGETS[target];
  return (
    <details data-lab-advanced="" style={DISCLOSURE_STYLE}>
      <summary style={DISCLOSURE_SUMMARY_STYLE}>{t("devTools.advanced")}</summary>
      <div style={READOUT_STYLE}>
        <h3 style={READOUT_LABEL_STYLE}>{t("devTools.scaleFacts")}</h3>
        <pre style={PRE_STYLE}>
          {JSON.stringify(
            {
              logicalSize: targetMeta.logicalSize,
              shellSize: targetMeta.shellSize,
              characterSize: targetMeta.characterSize,
              displayScale,
              autoScale: displayScale === "auto" ? effectiveScale : null,
              previewEnvironment,
              backingScale: captureScale ?? null,
            },
            null,
            2,
          )}
        </pre>
        {target === "full" ? (
          <>
            <h3 style={READOUT_LABEL_STYLE}>{t("inspector.composedInput")}</h3>
            <pre style={PRE_STYLE}>
              {overlayProjection !== null
                ? formatRawFacts(overlayProjection)
                : JSON.stringify(composed, null, 2)}
            </pre>
            <h3 style={READOUT_LABEL_STYLE}>{t("inspector.shaderReadout")}</h3>
            <pre style={PRE_STYLE}>{JSON.stringify(readout, null, 2)}</pre>
          </>
        ) : (
          <span style={HINT_STYLE}>{t("devTools.fullOnlyDiagnostics")}</span>
        )}
      </div>
    </details>
  );
}

/** Compact-only facts: current renderer capability mode and forced motion. */
function CompactFacts({
  activeScenario,
  t,
}: {
  activeScenario: LabCompactScenario | null;
  t: TranslateFn;
}) {
  if (activeScenario === null) {
    return null;
  }
  return (
    <>
      <h3 style={READOUT_LABEL_STYLE}>{t("devTools.compact.scenario")}</h3>
      <div style={{ fontSize: 11, color: "#b9b3c8", display: "grid", gap: 3 }}>
        <span>
          {t("devTools.compact.mode")}: {activeScenario.pointerMode === "live"
            ? t("devTools.compact.live")
            : t("devTools.compact.neutral")}
        </span>
        <span>
          {t("devTools.compact.reducedMotion")}: {activeScenario.forcedReducedMotion
            ? t("devTools.on")
            : t("devTools.off")}
        </span>
      </div>
    </>
  );
}

function ScenarioFacts({
  projection,
  t,
  queueOpen,
  onQueueOpenChange,
}: {
  projection: LabOverlayProjection;
  t: TranslateFn;
  queueOpen: boolean;
  onQueueOpenChange: (open: boolean) => void;
}) {
  const raw = projection.raw;
  const primaryDownload = projection.primaryTask?.kind === "download"
    ? raw.queue.tasksById[raw.queue.order[0]]
    : null;
  const primaryDownloadProgress = raw.queue.progressByTrace
    ? Object.values(raw.queue.progressByTrace)[0]
    : undefined;
  const primaryTranscode = raw.transcodeTasks[0] ?? null;

  const rows = raw.queue.order.map((traceId) => {
    const task = raw.queue.tasksById[traceId];
    if (!task) {
      return null;
    }
    const row = projectLabQueueRow(raw.queue, task, t);
    return (
      <div key={traceId} style={{ fontSize: 11, color: "#b9b3c8" }}>
        <span style={{ color: "#ece8f2" }}>{task.label}</span>
        {" · "}{row.progressText}
        {" · "}{row.progressPercent}%
      </div>
    );
  });

  return (
    <>
      {raw.fixtureKind === "download" || raw.fixtureKind === "mixed" ? (
        <>
          <h3 style={READOUT_LABEL_STYLE}>{t("inspector.download.primaryTask")}</h3>
          <div style={{ fontSize: 11, color: "#b9b3c8", display: "grid", gap: 3 }}>
            <span>{t("inspector.download.trace")}: {primaryDownload?.traceId ?? "—"}</span>
            <span>{t("inspector.download.stage")}: {primaryDownloadProgress?.stage ?? "—"}</span>
            <span>{t("inspector.download.percent")}: {primaryDownloadProgress?.percent ?? "—"}%</span>
            <span>{t("inspector.download.count")}: {raw.queue.order.length}</span>
            <span>{t("inspector.download.speed")}: {primaryDownloadProgress?.speed ?? "—"}</span>
            <span>{t("inspector.download.eta")}: {primaryDownloadProgress?.eta ?? "—"}</span>
          </div>
          <label style={ROW_STYLE}>
            <input
              type="checkbox"
              checked={queueOpen}
              onChange={(event) => onQueueOpenChange(event.target.checked)}
            />
            {t("inspector.download.rows")}
          </label>
          <div style={{ display: "grid", gap: 4 }}>{rows}</div>
        </>
      ) : null}

      {raw.fixtureKind === "transcode" || raw.fixtureKind === "mixed" ? (
        <>
          <h3 style={READOUT_LABEL_STYLE}>{t("inspector.transcode.stage")}</h3>
          <div style={{ fontSize: 11, color: "#b9b3c8", display: "grid", gap: 3 }}>
            <span>{t("inspector.transcode.stage")}: {primaryTranscode?.stage ?? "—"}</span>
            <span>{t("inspector.transcode.percent")}: {primaryTranscode?.progressPercent ?? "—"}%</span>
            <span>{t("inspector.transcode.count")}: {raw.transcodeTasks.length}</span>
            {primaryTranscode?.error ? (
              <span>{t("inspector.transcode.failure")}: {primaryTranscode.error}</span>
            ) : null}
          </div>
        </>
      ) : null}

      {raw.fixtureKind === "runtime" && raw.runtimeGate ? (
        <>
          <h3 style={READOUT_LABEL_STYLE}>{t("inspector.runtime.phase")}</h3>
          <div style={{ fontSize: 11, color: "#b9b3c8", display: "grid", gap: 3 }}>
            <span>{t("inspector.runtime.phase")}: {raw.runtimeGate.phase}</span>
            <span>{t("inspector.runtime.components")}: {raw.runtimeGate.missingComponents.join(", ") || "—"}</span>
            <span>{t("inspector.runtime.progress")}: {raw.runtimeGate.progressPercent ?? "—"}%</span>
            {raw.runtimeGate.lastError ? (
              <span>{t("inspector.runtime.error")}: {raw.runtimeGate.lastError}</span>
            ) : null}
          </div>
        </>
      ) : null}
    </>
  );
}
