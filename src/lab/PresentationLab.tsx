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
import { useTheme } from "../contexts/ThemeContext";
import { clampNormalizedOrigin, composeLabInput, createLabPresentationState, LAB_ACTIVATION_PRESETS, LAB_PROGRESS_PRESETS, reduceLabPresentation } from "./scenarios";
import { LabOverlayStage, type WebglReadbackResult } from "./LabOverlayStage";
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

const prefersReducedMotion = (): boolean => (
  typeof window !== "undefined"
  && typeof window.matchMedia === "function"
  && window.matchMedia("(prefers-reduced-motion: reduce)").matches
);

/**
 * Live readout of the production WebGL2 program uniforms. The Lab never
 * creates a renderer, runtime, or shader: it only inspects the uniforms the
 * existing ExpandedPresentationSurface already draws, the same way the MR9
 * CDP validation harness does.
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
    time: readScalar("uTime"),
  };
};

const PAGE_STYLE: CSSProperties = {
  minHeight: "100vh",
  display: "flex",
  gap: 16,
  padding: 16,
  boxSizing: "border-box",
  background: "#141318",
  color: "#ece8f2",
  fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif",
};

const PANE_STYLE: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
  background: "#1d1b22",
  border: "1px solid #302c3a",
  borderRadius: 12,
  padding: 14,
  minWidth: 240,
  maxHeight: "calc(100vh - 32px)",
  overflowY: "auto",
};

const TITLE_STYLE: CSSProperties = {
  margin: 0,
  fontSize: 15,
  fontWeight: 700,
  color: "#f2eff7",
};

const SUBTITLE_STYLE: CSSProperties = {
  margin: 0,
  fontSize: 11,
  lineHeight: 1.4,
  color: "#8f89a0",
};

const SECTION_STYLE: CSSProperties = {
  margin: "10px 0 2px",
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: "#a49eb8",
};

const BUTTON_STYLE: CSSProperties = {
  width: "100%",
  textAlign: "left",
  border: "1px solid #3a3547",
  borderRadius: 10,
  background: "#242129",
  color: "#ece8f2",
  padding: "9px 11px",
  cursor: "pointer",
  display: "grid",
  gap: 3,
  font: "inherit",
};

const ACTIVE_BUTTON_STYLE: CSSProperties = {
  ...BUTTON_STYLE,
  borderColor: "#b56a4a",
  boxShadow: "inset 0 0 0 1px #b56a4a",
};

const CATEGORY_PILL_STYLE: CSSProperties = {
  border: "1px solid #3a3547",
  borderRadius: 999,
  background: "#242129",
  color: "#ece8f2",
  padding: "6px 10px",
  fontSize: 12,
  cursor: "pointer",
  font: "inherit",
};

const ACTIVE_CATEGORY_PILL_STYLE: CSSProperties = {
  ...CATEGORY_PILL_STYLE,
  borderColor: "#b56a4a",
  background: "#3a2a22",
  color: "#ffd9b8",
};

const PRESET_ROW_STYLE: CSSProperties = {
  display: "flex",
  gap: 6,
  flexWrap: "wrap",
};

const PRESET_BUTTON_STYLE: CSSProperties = {
  border: "1px solid #3a3547",
  borderRadius: 8,
  background: "#242129",
  color: "#ece8f2",
  padding: "5px 9px",
  fontSize: 12,
  cursor: "pointer",
  font: "inherit",
};

const CENTER_STYLE: CSSProperties = {
  flex: 1,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: 12,
};

const PREVIEW_CAPTION_STYLE: CSSProperties = {
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

const EXPORT_BUTTON_STYLE: CSSProperties = {
  border: "1px solid #b56a4a",
  borderRadius: 10,
  background: "#3a2a22",
  color: "#ffd9b8",
  padding: "8px 14px",
  fontSize: 12,
  fontWeight: 700,
  cursor: "pointer",
  font: "inherit",
};

const EXPORT_BUTTON_DISABLED_STYLE: CSSProperties = {
  ...EXPORT_BUTTON_STYLE,
  opacity: 0.45,
  cursor: "default",
};

type CategoryId = "activation" | "downloadProgress" | "runtime" | "transcode" | "mixed" | "reducedMotion";

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
  "runtime-auto-config": "runtimeAutoConfig",
  "runtime-failed": "runtimeFailed",
  "download-active": "downloadActive",
  "download-queued": "downloadQueued",
  "transcode-active": "transcodeActive",
  "transcode-failed": "transcodeFailed",
  "mixed-busy": "mixedBusy",
};

const presetLabelKey = (id: string): string => PRESET_LABEL_KEYS[id] ?? id;

const CATEGORIES: readonly { id: CategoryId; key: string }[] = [
  { id: "activation", key: "nav.activation" },
  { id: "downloadProgress", key: "nav.downloadProgress" },
  { id: "runtime", key: "nav.runtime" },
  { id: "transcode", key: "nav.transcode" },
  { id: "mixed", key: "nav.mixed" },
  { id: "reducedMotion", key: "nav.reducedMotion" },
];

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

export function PresentationLab() {
  const { t } = useTranslation("lab");
  const [state, dispatch] = useReducer(
    reduceLabPresentation,
    undefined,
    () => createLabPresentationState({ reducedMotion: prefersReducedMotion() }),
  );
  const [activeCategory, setActiveCategory] = useState<CategoryId>("activation");
  const [activeFixtureId, setActiveFixtureId] = useState<string | null>(null);
  const [queueOpen, setQueueOpen] = useState(false);
  const [runtimeHovered, setRuntimeHovered] = useState(false);
  const [exportState, setExportState] = useState<"idle" | "exporting" | "success" | "failure">("idle");
  const [exportError, setExportError] = useState<string | null>(null);
  const [captureScale, setCaptureScale] = useState<number | undefined>(undefined);
  const [captureEpoch, setCaptureEpoch] = useState(0);
  const webglReadbackRef = useRef<((result: WebglReadbackResult | null) => void) | null>(null);
  const exportResetTimerRef = useRef<number | null>(null);
  const [readout, setReadout] = useState<ShaderReadout>(() => readShaderReadout());

  const composed = useMemo(() => composeLabInput(state), [state]);
  const overlayProjection = useMemo<LabOverlayProjection | null>(() => {
    if (activeFixtureId === null) {
      return null;
    }
    const fixture = fixtureOfCategory(activeFixtureId);
    return fixture ? projectLabOverlayFixture(fixture, t) : null;
  }, [activeFixtureId, t]);

  useEffect(() => {
    const handle = window.setInterval(() => setReadout(readShaderReadout()), 120);
    return () => window.clearInterval(handle);
  }, []);

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

  const surfaceTarget = overlayProjection !== null
    ? overlayProjection.expandedTarget
    : composed.target;
  const surfaceReducedMotion = overlayProjection !== null
    ? state.reducedMotion
    : composed.reducedMotion;

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

  const selectCategory = useCallback((category: CategoryId) => {
    setActiveCategory(category);
  }, []);

  const selectOverlayScenario = useCallback((fixtureId: string) => {
    setActiveFixtureId(fixtureId);
    setQueueOpen(false);
    setActiveCategory(
      fixtureId === "download-active" || fixtureId === "download-queued"
        ? "downloadProgress"
        : fixtureId === "runtime-auto-config" || fixtureId === "runtime-failed"
          ? "runtime"
          : fixtureId === "transcode-active" || fixtureId === "transcode-failed"
            ? "transcode"
            : "mixed",
    );
  }, []);

  const selectActivationPreset = useCallback((presetId: string) => {
    setActiveFixtureId(null);
    dispatch({ type: "activate", presetId, now: performance.now() });
  }, []);

  const selectProgressAction = useCallback((action: Parameters<typeof dispatch>[0]) => {
    setActiveFixtureId(null);
    dispatch(action);
  }, []);

  const resetCategory = useCallback(() => {
    setActiveFixtureId(null);
    setQueueOpen(false);
    setRuntimeHovered(false);
    dispatch({ type: "clearProgress" });
    dispatch({ type: "setReducedMotion", enabled: prefersReducedMotion() });
  }, []);

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
   * layout never changes.
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

  return (
    <div style={PAGE_STYLE}>
      <aside style={PANE_STYLE} aria-label={t("nav.activation")}>
        <h1 style={TITLE_STYLE}>{t("appTitle")}</h1>
        <p style={SUBTITLE_STYLE}>{t("appSubtitle")}</p>

        <div style={PRESET_ROW_STYLE}>
          {CATEGORIES.map((category) => (
            <button
              key={category.id}
              type="button"
              onClick={() => selectCategory(category.id)}
              style={activeCategory === category.id ? ACTIVE_CATEGORY_PILL_STYLE : CATEGORY_PILL_STYLE}
            >
              {t(category.key)}
            </button>
          ))}
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 style={SECTION_STYLE}>
            {t("inspector.scenario")}
          </h2>
          <button
            type="button"
            onClick={resetCategory}
            style={{ border: "none", background: "none", color: "#8f89a0", fontSize: 11, cursor: "pointer", font: "inherit" }}
          >
            {t("nav.reset")}
          </button>
        </div>
        <span style={{ fontSize: 10.5, color: "#8f89a0" }}>{t("nav.resetHint")}</span>

        {activeCategory === "activation" || activeCategory === "reducedMotion" ? (
          <>
            {activeCategory === "reducedMotion"
              ? (
                <>
                  {["intake-reduced", "folder-reduced"].map((presetId) => {
                    const preset = LAB_ACTIVATION_PRESETS.find((item) => item.id === presetId);
                    if (!preset) {
                      return null;
                    }
                    const active = state.activation?.presetId === preset.id && activeFixtureId === null;
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => selectActivationPreset(preset.id)}
                        style={active ? ACTIVE_BUTTON_STYLE : BUTTON_STYLE}
                      >
                        <strong style={{ fontSize: 12 }}>{t(`presets.${presetLabelKey(preset.id)}.label`)}</strong>
                        <span style={{ fontSize: 10.5, color: "#8f89a0", lineHeight: 1.35 }}>
                          {t(`presets.${presetLabelKey(preset.id)}.description`)}
                        </span>
                      </button>
                    );
                  })}
                </>
              )
              : (
                <>
                  {["intake-local", "intake-center", "folder"].map((presetId) => {
                    const preset = LAB_ACTIVATION_PRESETS.find((item) => item.id === presetId);
                    if (!preset) {
                      return null;
                    }
                    const active = state.activation?.presetId === preset.id && activeFixtureId === null;
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => selectActivationPreset(preset.id)}
                        style={active ? ACTIVE_BUTTON_STYLE : BUTTON_STYLE}
                      >
                        <strong style={{ fontSize: 12 }}>{t(`presets.${presetLabelKey(preset.id)}.label`)}</strong>
                        <span style={{ fontSize: 10.5, color: "#8f89a0", lineHeight: 1.35 }}>
                          {t(`presets.${presetLabelKey(preset.id)}.description`)}
                        </span>
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    onClick={() => dispatch({ type: "replay", now: performance.now() })}
                    disabled={state.activation === null}
                    style={state.activation === null ? { ...BUTTON_STYLE, opacity: 0.45, cursor: "default" } : BUTTON_STYLE}
                  >
                    <strong style={{ fontSize: 12 }}>{t("presets.replay")}</strong>
                    <span style={{ fontSize: 10.5, color: "#8f89a0", lineHeight: 1.35 }}>
                      {t("presets.replayHint")}
                    </span>
                  </button>
                </>
              )}
          </>
        ) : null}

        {activeCategory === "downloadProgress" ? (
          <>
            <h2 style={SECTION_STYLE}>{t("presets.progress0")} → {t("presets.progress100")}</h2>
            <div style={PRESET_ROW_STYLE}>
              {LAB_PROGRESS_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => selectProgressAction({ type: "progressPreset", presetId: preset.id })}
                  style={PRESET_BUTTON_STYLE}
                >
                  {t(`presets.${presetLabelKey(preset.id)}`)}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => selectProgressAction({ type: "progressIndeterminate" })}
              style={BUTTON_STYLE}
            >
              <strong style={{ fontSize: 12 }}>{t("presets.indeterminate")}</strong>
              <span style={{ fontSize: 10.5, color: "#8f89a0", lineHeight: 1.35 }}>
                {t("presets.indeterminateHint")}
              </span>
            </button>
            <button
              type="button"
              onClick={() => selectProgressAction({ type: "downwardRevision" })}
              disabled={state.progress.kind !== "determinate" || state.progress.target <= 0}
              style={state.progress.kind !== "determinate" || state.progress.target <= 0
                ? { ...BUTTON_STYLE, opacity: 0.45, cursor: "default" }
                : BUTTON_STYLE}
            >
              <strong style={{ fontSize: 12 }}>{t("presets.downwardRevision")}</strong>
              <span style={{ fontSize: 10.5, color: "#8f89a0", lineHeight: 1.35 }}>
                {t("presets.downwardRevisionHint")}
              </span>
            </button>
            <button
              type="button"
              onClick={() => selectProgressAction({ type: "replaceTrace" })}
              style={BUTTON_STYLE}
            >
              <strong style={{ fontSize: 12 }}>{t("presets.replaceTrace")}</strong>
              <span style={{ fontSize: 10.5, color: "#8f89a0", lineHeight: 1.35 }}>
                {t("presets.replaceTraceHint")}
              </span>
            </button>
            <button
              type="button"
              onClick={() => selectProgressAction({ type: "clearProgress" })}
              style={BUTTON_STYLE}
            >
              <strong style={{ fontSize: 12 }}>{t("presets.clearProgress")}</strong>
              <span style={{ fontSize: 10.5, color: "#8f89a0", lineHeight: 1.35 }}>
                {t("presets.clearProgressHint")}
              </span>
            </button>

            <h2 style={SECTION_STYLE}>Download</h2>
            {["download-active", "download-queued"].map((fixtureId) => {
              const active = activeFixtureId === fixtureId;
              return (
                <button
                  key={fixtureId}
                  type="button"
                  onClick={() => selectOverlayScenario(fixtureId)}
                  style={active ? ACTIVE_BUTTON_STYLE : BUTTON_STYLE}
                >
                  <strong style={{ fontSize: 12 }}>{t(`presets.${presetLabelKey(fixtureId)}.label`)}</strong>
                  <span style={{ fontSize: 10.5, color: "#8f89a0", lineHeight: 1.35 }}>
                    {t(`presets.${presetLabelKey(fixtureId)}.description`)}
                  </span>
                </button>
              );
            })}
          </>
        ) : null}

        {activeCategory === "runtime" ? (
          <>
            {["runtime-auto-config", "runtime-failed"].map((fixtureId) => {
              const active = activeFixtureId === fixtureId;
              return (
                <button
                  key={fixtureId}
                  type="button"
                  onClick={() => selectOverlayScenario(fixtureId)}
                  style={active ? ACTIVE_BUTTON_STYLE : BUTTON_STYLE}
                >
                  <strong style={{ fontSize: 12 }}>{t(`presets.${presetLabelKey(fixtureId)}.label`)}</strong>
                  <span style={{ fontSize: 10.5, color: "#8f89a0", lineHeight: 1.35 }}>
                    {t(`presets.${presetLabelKey(fixtureId)}.description`)}
                  </span>
                </button>
              );
            })}
          </>
        ) : null}

        {activeCategory === "transcode" ? (
          <>
            {["transcode-active", "transcode-failed"].map((fixtureId) => {
              const active = activeFixtureId === fixtureId;
              return (
                <button
                  key={fixtureId}
                  type="button"
                  onClick={() => selectOverlayScenario(fixtureId)}
                  style={active ? ACTIVE_BUTTON_STYLE : BUTTON_STYLE}
                >
                  <strong style={{ fontSize: 12 }}>{t(`presets.${presetLabelKey(fixtureId)}.label`)}</strong>
                  <span style={{ fontSize: 10.5, color: "#8f89a0", lineHeight: 1.35 }}>
                    {t(`presets.${presetLabelKey(fixtureId)}.description`)}
                  </span>
                </button>
              );
            })}
          </>
        ) : null}

        {activeCategory === "mixed" ? (
          <>
            {["mixed-busy"].map((fixtureId) => {
              const active = activeFixtureId === fixtureId;
              return (
                <button
                  key={fixtureId}
                  type="button"
                  onClick={() => selectOverlayScenario(fixtureId)}
                  style={active ? ACTIVE_BUTTON_STYLE : BUTTON_STYLE}
                >
                  <strong style={{ fontSize: 12 }}>{t(`presets.${presetLabelKey(fixtureId)}.label`)}</strong>
                  <span style={{ fontSize: 10.5, color: "#8f89a0", lineHeight: 1.35 }}>
                    {t(`presets.${presetLabelKey(fixtureId)}.description`)}
                  </span>
                </button>
              );
            })}
          </>
        ) : null}
      </aside>

      <main style={CENTER_STYLE} aria-label="Live production preview">
        <LabOverlayStage
          target={surfaceTarget}
          reducedMotion={surfaceReducedMotion}
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
          onPreviewClick={handlePreviewClick}
          captureScale={captureScale}
          captureEpoch={captureEpoch}
          onWebglReadback={onWebglReadback}
        />
        <p style={PREVIEW_CAPTION_STYLE}>
          {t("preview.caption")}
        </p>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <button
            type="button"
            data-lab-export=""
            onClick={() => {
              void handleExport();
            }}
            disabled={exportState === "exporting"}
            style={exportState === "exporting" ? EXPORT_BUTTON_DISABLED_STYLE : EXPORT_BUTTON_STYLE}
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
        </div>
      </main>

      <aside style={PANE_STYLE} aria-label={t("inspector.title")}>
        <h2 style={TITLE_STYLE}>{t("inspector.title")}</h2>

        <label style={ROW_STYLE}>
          <input
            type="checkbox"
            checked={state.reducedMotion}
            onChange={(event) =>
              dispatch({ type: "setReducedMotion", enabled: event.target.checked })}
          />
          {t("inspector.reducedMotion")}
        </label>
        <span style={{ fontSize: 10.5, color: "#8f89a0" }}>
          {t("inspector.reducedMotionHint")}
        </span>

        {overlayProjection === null ? (
          <>
            <div style={ROW_STYLE}>
              <span style={{ minWidth: 74 }}>{t("inspector.originX")}</span>
              <input
                type="number"
                min={0}
                max={1}
                step={0.01}
                value={state.pointerOrigin.x}
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
                onChange={(event) =>
                  dispatch({
                    type: "setPointerOrigin",
                    origin: clampNormalizedOrigin(state.pointerOrigin.x, Number(event.target.value)),
                  })}
              />
            </div>
            <span style={{ fontSize: 10.5, color: "#8f89a0" }}>
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
            <span style={{ fontSize: 10.5, color: "#8f89a0" }}>
              {t("inspector.determinateHint")}
            </span>
          </>
        ) : (
          <ScenarioFacts
            projection={overlayProjection}
            t={t}
            queueOpen={queueOpen}
            onQueueOpenChange={setQueueOpen}
          />
        )}

        <div style={READOUT_STYLE}>
          <h3 style={READOUT_LABEL_STYLE}>{t("inspector.composedInput")}</h3>
          <pre style={PRE_STYLE}>
            {overlayProjection !== null
              ? formatRawFacts(overlayProjection)
              : JSON.stringify(composed, null, 2)}
          </pre>
          <h3 style={READOUT_LABEL_STYLE}>{t("inspector.shaderReadout")}</h3>
          <pre style={PRE_STYLE}>{JSON.stringify(readout, null, 2)}</pre>
        </div>
      </aside>
    </div>
  );
}

function ScenarioFacts({
  projection,
  t,
  queueOpen,
  onQueueOpenChange,
}: {
  projection: LabOverlayProjection;
  t: (key: string, options?: Record<string, unknown>) => string;
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
