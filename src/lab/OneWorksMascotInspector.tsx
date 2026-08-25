/** Browser-only OneWorks candidate and mechanism inspection harness. */
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import {
  Avatar,
  AvatarEditor,
  type AvatarDefinition,
  type AvatarHandle,
} from "@oneworks/avatar-react";
import "@oneworks/avatar-react/style.css";
import { useTheme } from "../contexts/ThemeContext";
import { getContinuousCornerStyle } from "../components/ui/shared-styles";
import { getLabChipStyle } from "./labControls";
import {
  ONEWORKS_AMEOW_ACTION_IDS,
  ONEWORKS_AMEOW_ACTION_LIBRARY,
  ONEWORKS_AMEOW_CANDIDATE_CHECKSUM,
  ONEWORKS_AMEOW_CANDIDATE_ID,
  ONEWORKS_AMEOW_LAB_POSE_ENVELOPE,
  ONEWORKS_AMEOW_PRODUCTION_ATTENTION_FACTS,
  createOneWorksAmeowCandidateDefinition,
  getOneWorksAmeowActionClip,
  loadOneWorksAmeowCandidate,
  resolveOneWorksAmeowAttentionPreview,
  serializeOneWorksAmeowCandidate,
  withOneWorksAmeowActionPreview,
  type OneWorksAmeowActionId,
} from "./oneworksAmeowCandidate";
import {
  ONEWORKS_INSPECTOR_ANIMATION_LIBRARY,
  ONEWORKS_POSE_PRESETS,
  ONEWORKS_REGISTRY_VERSION,
  ONEWORKS_SOURCE_REVISION,
  ONEWORKS_SWEEP_POSES,
  createOneWorksCatDefinition,
  withOneWorksPose,
} from "./oneworksMascot";

type OneWorksMascotInspectorProps = Readonly<{
  onExit: () => void;
}>;

type ProductDecisionPoseId = "front" | "moderate-yaw" | "moderate-pitch" | "pointer";

const PAGE_STYLE: CSSProperties = {
  minHeight: "100vh",
  boxSizing: "border-box",
  padding: 16,
  fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif",
};

const LABEL_STYLE: CSSProperties = {
  margin: 0,
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
};

const HINT_STYLE: CSSProperties = {
  margin: 0,
  fontSize: 11,
  lineHeight: 1.45,
};

const ATTENTION_STAGE_SIZE = 96;
const ATTENTION_CENTER = { x: ATTENTION_STAGE_SIZE / 2, y: ATTENTION_STAGE_SIZE / 2 };
const ATTENTION_SAMPLES = [
  { id: "center", label: "Center / dead zone", point: ATTENTION_CENTER },
  { id: "peak", label: "Approach peak", point: { x: ATTENTION_CENTER.x + 24.5, y: ATTENTION_CENTER.y } },
  { id: "outer", label: "Outer recenter", point: { x: ATTENTION_CENTER.x + 46, y: ATTENTION_CENTER.y } },
] as const;

const PRODUCT_DECISION_POSES: Readonly<Record<Exclude<ProductDecisionPoseId, "pointer">, Readonly<{ pitch: number; yaw: number }>>> = {
  front: { yaw: 0, pitch: 0 },
  "moderate-yaw": { yaw: 0.22, pitch: 0 },
  "moderate-pitch": { yaw: 0, pitch: -0.13 },
};

const SWEEP_ANIMATION = ONEWORKS_INSPECTOR_ANIMATION_LIBRARY.groups.pose.clips.sweep;
const ANIMATION_LIBRARIES = [ONEWORKS_INSPECTOR_ANIMATION_LIBRARY, ONEWORKS_AMEOW_ACTION_LIBRARY];
const UPSTREAM_SOURCE_CAT_REFERENCE = createOneWorksCatDefinition();

/**
 * A Lab-only controlled host. Editor changes stay local; the canonical source
 * can always be deterministically exported and reloaded without storage.
 */
export function OneWorksMascotInspector({ onExit }: OneWorksMascotInspectorProps) {
  const { colors } = useTheme();
  const [definition, setDefinition] = useState<AvatarDefinition>(createOneWorksAmeowCandidateDefinition);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [playingSweep, setPlayingSweep] = useState(false);
  const [activeAction, setActiveAction] = useState<OneWorksAmeowActionId>("idle");
  const [productDecisionPose, setProductDecisionPose] = useState<ProductDecisionPoseId>("front");
  const [attentionPoint, setAttentionPoint] = useState(ATTENTION_CENTER);
  const [inspectionPose, setInspectionPose] = useState(ONEWORKS_POSE_PRESETS[0]);
  const [mounted, setMounted] = useState(true);
  const [documentVisible, setDocumentVisible] = useState(
    () => typeof document === "undefined" || document.visibilityState !== "hidden",
  );
  const mechanismAvatarRef = useRef<AvatarHandle | null>(null);
  const candidateAvatarRef = useRef<AvatarHandle | null>(null);
  const candidate60AvatarRef = useRef<AvatarHandle | null>(null);

  const regionMounted = mounted && documentVisible;
  const attentionPreview = resolveOneWorksAmeowAttentionPreview(
    attentionPoint,
    ATTENTION_CENTER,
    reducedMotion,
  );
  const productPose = productDecisionPose === "pointer"
    ? attentionPreview.view
    : PRODUCT_DECISION_POSES[productDecisionPose];
  const productDefinition = withOneWorksAmeowActionPreview(
    withOneWorksPose(definition, productPose),
    activeAction,
  );
  const mechanismDefinition = withOneWorksPose(definition, inspectionPose.view);
  const surfaceStyle: CSSProperties = {
    ...getContinuousCornerStyle(16),
    border: `1px solid ${colors.fieldBorder}`,
    background: `linear-gradient(180deg, ${colors.bgGradientStart}, ${colors.bgGradientEnd})`,
    boxShadow: `inset 0 1px 0 ${colors.fieldInset}`,
  };
  const quietTextStyle: CSSProperties = { ...HINT_STYLE, color: colors.textSecondary };

  const stopPlayback = (reset: boolean) => {
    setPlayingSweep(false);
    setActiveAction("idle");
    mechanismAvatarRef.current?.stop({ reset });
    candidateAvatarRef.current?.stop({ reset });
    candidate60AvatarRef.current?.stop({ reset });
  };

  const handleDefinitionChange = (next: AvatarDefinition) => {
    stopPlayback(false);
    setDefinition(next);
  };

  const handleReducedMotionChange = (enabled: boolean) => {
    setReducedMotion(enabled);
    if (enabled) {
      stopPlayback(true);
      setProductDecisionPose("front");
      setInspectionPose(ONEWORKS_POSE_PRESETS[0]);
    }
  };

  const handleAttentionPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    setAttentionPoint({
      x: Math.min(Math.max(event.clientX - rect.left, 0), rect.width),
      y: Math.min(Math.max(event.clientY - rect.top, 0), rect.height),
    });
    setProductDecisionPose("pointer");
    setPlayingSweep(false);
    setActiveAction("idle");
  };

  const handleAction = (action: OneWorksAmeowActionId) => {
    if (reducedMotion) return;
    setPlayingSweep(false);
    setActiveAction(action);
    const clip = getOneWorksAmeowActionClip(action);
    if (clip !== null) {
      void candidateAvatarRef.current?.play(clip, { playback: "once" });
      void candidate60AvatarRef.current?.play(clip, { playback: "once" });
    }
  };

  const handleCanonicalReload = () => {
    stopPlayback(true);
    setDefinition(loadOneWorksAmeowCandidate(
      serializeOneWorksAmeowCandidate(createOneWorksAmeowCandidateDefinition()),
    ));
    setProductDecisionPose("front");
    setInspectionPose(ONEWORKS_POSE_PRESETS[0]);
  };

  const handleExport = () => {
    const anchor = document.createElement("a");
    anchor.download = `${ONEWORKS_AMEOW_CANDIDATE_ID}.json`;
    anchor.href = `data:application/json;charset=utf-8,${encodeURIComponent(serializeOneWorksAmeowCandidate(definition))}`;
    anchor.click();
  };

  const handleUnmount = () => {
    stopPlayback(false);
    setMounted(false);
  };

  useEffect(() => {
    const handleVisibilityChange = () => {
      const visible = document.visibilityState !== "hidden";
      setDocumentVisible(visible);
      if (!visible) stopPlayback(false);
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, []);

  useEffect(() => () => {
    mechanismAvatarRef.current?.stop({ reset: false });
    candidateAvatarRef.current?.stop({ reset: false });
    candidate60AvatarRef.current?.stop({ reset: false });
  }, []);

  return (
    <main
      aria-label="OneWorks Ameow Mascot Inspector"
      data-oneworks-mascot-inspector=""
      style={{ ...PAGE_STYLE, background: colors.bgPrimary, color: colors.textPrimary }}
    >
      <section
        style={{ ...surfaceStyle, maxWidth: 1500, margin: "0 auto", padding: 16 }}
        data-oneworks-inspector-shell=""
      >
        <header style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <div>
            <p style={{ ...LABEL_STYLE, color: colors.accentText }}>OneWorks · Ameow visual candidate · Lab only</p>
            <p style={{ margin: "4px 0 0", fontSize: 13, color: colors.textPrimary }}>
              Direct Avatar + AvatarEditor candidate convergence and mechanism inspection
            </p>
          </div>
          <button type="button" className="lab-control" onClick={onExit} style={getLabChipStyle(colors)}>
            Back to presentation Lab
          </button>
        </header>

        <section style={{ borderTop: `1px solid ${colors.borderStart}`, marginTop: 14, paddingTop: 12 }} data-oneworks-candidate-product-decision="">
          <p style={{ ...LABEL_STYLE, color: colors.textSecondary }}>Product-decision preview · true 60 px first</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }} data-oneworks-candidate-product-controls="">
            {([
              ["front", "Front"],
              ["moderate-yaw", "Moderate yaw"],
              ["moderate-pitch", "Moderate pitch"],
              ["pointer", "Pointer preview"],
            ] as const).map(([id, label]) => (
              <button
                key={id}
                type="button"
                className="lab-control"
                aria-pressed={productDecisionPose === id}
                onClick={() => setProductDecisionPose(id)}
                style={getLabChipStyle(colors, { selected: productDecisionPose === id })}
              >
                {label}
              </button>
            ))}
            {ONEWORKS_AMEOW_ACTION_IDS.map((action) => (
              <button
                key={action}
                type="button"
                className="lab-control"
                disabled={reducedMotion}
                aria-pressed={activeAction === action}
                onClick={() => handleAction(action)}
                style={getLabChipStyle(colors, { disabled: reducedMotion, selected: activeAction === action })}
              >
                {action}
              </button>
            ))}
            <label style={{ display: "inline-flex", gap: 6, alignItems: "center", fontSize: 12, color: colors.textSecondary }}>
              <input
                type="checkbox"
                checked={reducedMotion}
                onChange={(event) => handleReducedMotionChange(event.target.checked)}
              />
              Reduced Motion: static canonical candidate
            </label>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }} data-oneworks-attention-controls="">
            {ATTENTION_SAMPLES.map((sample) => (
              <button
                key={sample.id}
                type="button"
                className="lab-control"
                onClick={() => {
                  setAttentionPoint(sample.point);
                  setProductDecisionPose("pointer");
                  setPlayingSweep(false);
                  setActiveAction("idle");
                }}
                style={getLabChipStyle(colors)}
              >
                {sample.label}
              </button>
            ))}
          </div>
          <p style={{ ...quietTextStyle, marginTop: 8 }}>
            Exact production eye-input recipe: {ONEWORKS_AMEOW_PRODUCTION_ATTENTION_FACTS.deadZonePx}px dead zone, {ONEWORKS_AMEOW_PRODUCTION_ATTENTION_FACTS.responseRadiusPx}px cosine response/recenter, normal {ONEWORKS_AMEOW_PRODUCTION_ATTENTION_FACTS.normalEyeBounds.x}/{ONEWORKS_AMEOW_PRODUCTION_ATTENTION_FACTS.normalEyeBounds.y} and Reduced Motion {ONEWORKS_AMEOW_PRODUCTION_ATTENTION_FACTS.reducedEyeBounds.x}/{ONEWORKS_AMEOW_PRODUCTION_ATTENTION_FACTS.reducedEyeBounds.y} eye bounds. Lab-only pose envelope: ±{Math.round(ONEWORKS_AMEOW_LAB_POSE_ENVELOPE.maxYawRadians * 180 / Math.PI)}° yaw / ±{Math.round(ONEWORKS_AMEOW_LAB_POSE_ENVELOPE.maxPitchRadians * 180 / Math.PI)}° pitch; production remains eye-only.
          </p>
          <div
            data-oneworks-candidate-attention-stage=""
            onPointerMove={handleAttentionPointerMove}
            style={{ display: "grid", gridTemplateColumns: "180px 280px", width: "fit-content", maxWidth: "100%", margin: "14px auto 0", gap: 16, alignItems: "start" }}
          >
            <PreviewLabel label="True 60 px candidate">
              <div style={{ width: ATTENTION_STAGE_SIZE, height: ATTENTION_STAGE_SIZE, display: "grid", placeItems: "center", margin: "0 auto", border: `1px dashed ${colors.controlStroke}`, borderRadius: 10 }}>
                <div data-oneworks-candidate-avatar-60="" style={{ width: 60, height: 60 }}>
                  {regionMounted ? <Avatar ref={candidate60AvatarRef} definition={productDefinition} interactive={false} animationLibraries={ANIMATION_LIBRARIES} theme="dark" style={{ width: "100%", height: "100%" }} /> : null}
                </div>
              </div>
            </PreviewLabel>
            <PreviewLabel label="Magnified companion · same candidate and pose">
              <div data-oneworks-candidate-avatar-magnified="" style={{ width: 280, height: 280, maxWidth: "100%", margin: "0 auto" }}>
                {regionMounted ? <Avatar ref={candidateAvatarRef} definition={productDefinition} interactive={false} animationLibraries={ANIMATION_LIBRARIES} onAnimationEnd={() => setActiveAction("idle")} theme="dark" style={{ width: "100%", height: "100%" }} /> : null}
              </div>
            </PreviewLabel>
          </div>
          <p style={{ ...quietTextStyle, marginTop: 8 }} data-oneworks-attention-readout="">
            Input sample {attentionPoint.x.toFixed(1)}, {attentionPoint.y.toFixed(1)} · production eye offset {attentionPreview.productionEyeOffset.x.toFixed(2)}, {attentionPreview.productionEyeOffset.y.toFixed(2)} · candidate pose {productPose.yaw.toFixed(3)}, {productPose.pitch.toFixed(3)}.
          </p>
        </section>

        <section style={{ borderTop: `1px solid ${colors.borderStart}`, marginTop: 16, paddingTop: 12 }} data-oneworks-candidate-source-reference="">
          <p style={{ ...LABEL_STYLE, color: colors.textSecondary }}>Pinned upstream cat reference · not the Ameow candidate</p>
          <div data-oneworks-source-reference-avatar-60="" style={{ width: 60, height: 60, margin: "10px 0 0" }}>
            {regionMounted ? <Avatar definition={UPSTREAM_SOURCE_CAT_REFERENCE} interactive={false} theme="dark" style={{ width: "100%", height: "100%" }} /> : null}
          </div>
        </section>

        <section style={{ borderTop: `1px solid ${colors.borderStart}`, marginTop: 16, paddingTop: 12 }} data-oneworks-candidate-persistence="">
          <p style={{ ...LABEL_STYLE, color: colors.textSecondary }}>Canonical Lab candidate · deterministic export and reload</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
            <button type="button" className="lab-control" onClick={handleExport} style={getLabChipStyle(colors)}>
              Export current candidate JSON
            </button>
            <button type="button" className="lab-control" onClick={handleCanonicalReload} style={getLabChipStyle(colors)}>
              Reload canonical candidate
            </button>
          </div>
          <p style={{ ...quietTextStyle, marginTop: 8 }} data-oneworks-candidate-identity="">
            {ONEWORKS_AMEOW_CANDIDATE_ID} · {ONEWORKS_AMEOW_CANDIDATE_CHECKSUM} · source {ONEWORKS_SOURCE_REVISION.slice(0, 12)} · registry {ONEWORKS_REGISTRY_VERSION}. Export/reload is Inspector-local and uses no browser or product storage.
          </p>
        </section>

        <section style={{ borderTop: `1px solid ${colors.borderStart}`, marginTop: 16, paddingTop: 12 }} data-oneworks-mechanism-inspection="">
          <p style={{ ...LABEL_STYLE, color: colors.textSecondary }}>Mechanism inspection · complete 360° retained separately</p>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }} data-oneworks-pose-controls="">
            {ONEWORKS_POSE_PRESETS.map((pose) => (
              <button
                key={pose.id}
                type="button"
                className="lab-control"
                aria-pressed={inspectionPose.id === pose.id}
                onClick={() => {
                  stopPlayback(false);
                  setInspectionPose(pose);
                }}
                style={getLabChipStyle(colors, { selected: inspectionPose.id === pose.id })}
              >
                {pose.label}
              </button>
            ))}
            <button
              type="button"
              className="lab-control"
              disabled={reducedMotion || !regionMounted}
              onClick={() => {
                setActiveAction("idle");
                setPlayingSweep((current) => !current);
              }}
              style={getLabChipStyle(colors, { disabled: reducedMotion || !regionMounted, selected: playingSweep })}
            >
              {playingSweep ? "Stop sweep playback" : "Play sweep"}
            </button>
          </div>
          <div data-oneworks-mechanism-preview="" style={{ display: "grid", gridTemplateColumns: "180px 280px", width: "fit-content", maxWidth: "100%", margin: "14px auto 0", gap: 16, alignItems: "start" }}>
            <PreviewLabel label="Mechanism true 60 px">
              <div data-oneworks-avatar-60="" style={{ width: 60, height: 60, margin: "0 auto" }}>
                {regionMounted ? <Avatar definition={mechanismDefinition} interactive={false} animation={playingSweep && !reducedMotion ? SWEEP_ANIMATION : null} autoplay={playingSweep && !reducedMotion} animationLibraries={ANIMATION_LIBRARIES} theme="dark" style={{ width: "100%", height: "100%" }} /> : null}
              </div>
            </PreviewLabel>
            <PreviewLabel label="Mechanism magnified">
              <div data-oneworks-avatar-magnified="" style={{ width: 280, height: 280, maxWidth: "100%", margin: "0 auto" }}>
                {regionMounted ? <Avatar ref={mechanismAvatarRef} definition={mechanismDefinition} interactive={false} animation={playingSweep && !reducedMotion ? SWEEP_ANIMATION : null} autoplay={playingSweep && !reducedMotion} animationLibraries={ANIMATION_LIBRARIES} theme="dark" style={{ width: "100%", height: "100%" }} /> : null}
              </div>
            </PreviewLabel>
          </div>
        </section>

        <section style={{ borderTop: `1px solid ${colors.borderStart}`, display: "grid", marginTop: 16, paddingTop: 12, width: "fit-content" }} data-oneworks-sweep-sheet="">
          <p style={{ ...LABEL_STYLE, color: colors.textSecondary }}>Complete 360° yaw sweep · shared Ameow candidate</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 10 }}>
            {ONEWORKS_SWEEP_POSES.map((pose) => (
              <div key={pose.id} style={{ width: 82, textAlign: "center" }}>
                <div style={{ width: 60, height: 60, margin: "0 auto" }}>
                  {regionMounted ? <Avatar definition={withOneWorksPose(definition, pose.view)} interactive={false} theme="dark" style={{ width: "100%", height: "100%" }} /> : null}
                </div>
                <span style={{ fontSize: 10.5, color: colors.textSecondary }}>{pose.label}</span>
              </div>
            ))}
          </div>
        </section>

        <section style={{ borderTop: `1px solid ${colors.borderStart}`, marginTop: 16, paddingTop: 12 }} data-oneworks-editor-host="">
          <p style={{ ...LABEL_STYLE, color: colors.textSecondary }}>Upstream AvatarEditor · bounded candidate calibration</p>
          <p style={{ ...quietTextStyle, margin: "5px 0 10px" }}>
            The editor stays upstream-owned. Its local changes feed the candidate previews, complete sweep, and current-export action only.
          </p>
          {regionMounted ? (
            <div style={{ minWidth: 640, minHeight: 640, overflow: "hidden" }}>
              <AvatarEditor definition={definition} onDefinitionChange={handleDefinitionChange} animationLibraries={ANIMATION_LIBRARIES} locale="en" theme="dark" />
            </div>
          ) : null}
        </section>

        <footer style={{ alignItems: "center", borderTop: `1px solid ${colors.borderStart}`, display: "flex", flexWrap: "wrap", gap: 8, marginTop: 16, paddingTop: 12, width: "fit-content" }} data-oneworks-lifecycle="">
          <button type="button" className="lab-control" onClick={handleUnmount} style={getLabChipStyle(colors, { disabled: !mounted })}>
            Unmount inspector
          </button>
          <button type="button" className="lab-control" disabled={mounted} onClick={() => setMounted(true)} style={getLabChipStyle(colors, { disabled: mounted })}>
            Remount inspector
          </button>
          <span style={{ fontSize: 11, color: colors.textSecondary }}>
            {regionMounted ? "upstream region mounted" : "upstream region torn down"} · document {documentVisible ? "visible" : "hidden"}
          </span>
          <span style={{ fontSize: 10.5, color: colors.textSecondary }}>
            Browser evidence records scheduler work; this UI claims no loop count.
          </span>
        </footer>
      </section>
    </main>
  );
}

function PreviewLabel({ children, label }: Readonly<{ children: ReactNode; label: string }>) {
  const { colors } = useTheme();
  return (
    <div style={{ display: "grid", gap: 8, textAlign: "center" }}>
      <p style={{ ...LABEL_STYLE, color: colors.textSecondary }}>{label}</p>
      {children}
    </div>
  );
}
