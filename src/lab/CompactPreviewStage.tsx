/**
 * Lab-local Compact preview host.
 *
 * Mounts the EXISTING production CompactCatCharacter renderer leaf directly in
 * the production 80×80 outer / 60×60 shell / 56×56 character geometry with one
 * Lab-local pointer MotionValue pair. It previews the current Compact renderer
 * only (neutral / pointer attention / Reduced Motion) and creates no canvas,
 * shader, runtime, or native window shell.
 *
 * It deliberately avoids the production native-window composition boundary
 * and does not modify the renderer leaf, recipe, hotspot metrics, or mascot
 * architecture. The stage is the annotation surface for the Compact target.
 */
import {
  useCallback,
  useEffect,
  useRef,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { useTheme } from "../contexts/ThemeContext";
import { CompactCatCharacter } from "../presentation/main-window/CompactCatCharacter";
import {
  getPanelShellStyle,
} from "../components/ui/shared-styles";
import {
  MAIN_WINDOW_COMPACT_SHELL_SIZE,
  MAIN_WINDOW_DEFAULT_COMPACT_OUTER_SIZE,
} from "../constants/windowMetrics";
import { MAIN_WINDOW_MINIMIZED_PANEL_RADIUS } from "../presentation/main-window/geometry";
import { CHARACTER_VISUAL_SIZE } from "../presentation/main-window/characterRecipe";
import {
  LAB_COMPACT_ATTENTION_CENTER,
  resetLabCompactPointerToCenter,
  updateLabCompactPointerFromClientPoint,
  useLabCompactPointerField,
} from "./compactPointerField";

export type LabCompactPointerMode = "live" | "neutral";

export type CompactPreviewStageProps = {
  /** The single Lab reducedMotion preview value (also drives the Full target). */
  reducedMotion: boolean;
  /**
   * Existing renderer capability only: `live` lets the pointer drive the
   * character's bounded attention; `neutral` pins the field to center.
   */
  pointerMode: LabCompactPointerMode;
};

const COMPACT_STAGE_FRAME_STYLE: CSSProperties = {
  position: "relative",
  width: MAIN_WINDOW_DEFAULT_COMPACT_OUTER_SIZE,
  height: MAIN_WINDOW_DEFAULT_COMPACT_OUTER_SIZE,
  flexShrink: 0,
};

export function CompactPreviewStage({
  reducedMotion,
  pointerMode,
}: CompactPreviewStageProps) {
  const { colors } = useTheme();
  const frameRef = useRef<HTMLDivElement | null>(null);
  const pointerField = useLabCompactPointerField();

  // Neutral mode pins the Lab-local field to the attention center so the
  // renderer leaf projects a neutral target. The field is the only mutable
  // Lab preview input for the Compact target.
  useEffect(() => {
    if (pointerMode === "neutral") {
      resetLabCompactPointerToCenter(pointerField);
    }
  }, [pointerField, pointerMode]);

  const handlePointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (pointerMode !== "live") {
      return;
    }
    const frame = frameRef.current;
    if (frame === null) {
      return;
    }
    updateLabCompactPointerFromClientPoint(
      pointerField,
      event.clientX,
      event.clientY,
      frame.getBoundingClientRect(),
    );
  }, [pointerField, pointerMode]);

  const handlePointerLeave = useCallback(() => {
    resetLabCompactPointerToCenter(pointerField);
  }, [pointerField]);

  const shellInset = (MAIN_WINDOW_DEFAULT_COMPACT_OUTER_SIZE - MAIN_WINDOW_COMPACT_SHELL_SIZE) / 2;
  const compactShellStyle = getPanelShellStyle(colors, {
    radius: MAIN_WINDOW_MINIMIZED_PANEL_RADIUS,
    boxShadow: colors.panelShadowCompact,
  }) as CSSProperties & { "-electron-corner-smoothing"?: string };
  delete compactShellStyle["-electron-corner-smoothing"];

  return (
    <div
      ref={frameRef}
      data-lab-compact-stage=""
      style={{
        ...COMPACT_STAGE_FRAME_STYLE,
        cursor: pointerMode === "live" ? "crosshair" : "default",
      }}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
    >
      <div
        data-lab-compact-shell=""
        style={{
          position: "absolute",
          left: shellInset,
          top: shellInset,
          width: MAIN_WINDOW_COMPACT_SHELL_SIZE,
          height: MAIN_WINDOW_COMPACT_SHELL_SIZE,
          ...compactShellStyle,
          overflow: "hidden",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <CompactCatCharacter
          size={CHARACTER_VISUAL_SIZE}
          bodyColor={colors.characterBody}
          eyeColor={colors.characterEye}
          reducedMotion={reducedMotion}
          pointerField={pointerField}
          attentionCenterX={LAB_COMPACT_ATTENTION_CENTER.x}
          attentionCenterY={LAB_COMPACT_ATTENTION_CENTER.y}
        />
      </div>
    </div>
  );
}
