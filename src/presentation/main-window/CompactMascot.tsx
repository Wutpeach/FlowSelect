// Compact-only Kirby-cat SVG host. It consumes the existing Pointer Field and
// environment inputs read-only, owns only disposable avatar-core playback,
// and emits no lifecycle, Product, native-window, IPC, or completion events.

import {
  renderAvatarDefinition,
  type AvatarScene,
} from "@bible-strong/avatar-core";
import { useCallback, useEffect, useId, useMemo, useRef } from "react";
import type { MotionValue } from "motion/react";
import {
  COMPACT_MASCOT_VIEWBOX,
  resolveCompactMascotAttention,
} from "./compactMascotRecipe";
import { createCompactMascotBehaviorRuntime } from "./compactMascotBehaviorRuntime";
import { COMPACT_MASCOT_DEFINITION } from "./compactMascotDefinition";

export type CompactMascotProps = {
  size: number;
  bodyColor: string;
  eyeColor: string;
  reducedMotion: boolean;
  pointerField: {
    x: MotionValue<number>;
    y: MotionValue<number>;
  };
  attentionCenterX: number;
  attentionCenterY: number;
};

export function CompactMascot({
  size,
  bodyColor,
  eyeColor,
  reducedMotion,
  pointerField,
  attentionCenterX,
  attentionCenterY,
}: CompactMascotProps) {
  const clipId = `compact-kirby-cat-${useId().replace(/:/g, "")}`;
  const clipPathRef = useRef<SVGPathElement | null>(null);
  const backEarARef = useRef<SVGPathElement | null>(null);
  const backEarBRef = useRef<SVGPathElement | null>(null);
  const headPathRef = useRef<SVGPathElement | null>(null);
  const leftEyePathRef = useRef<SVGPathElement | null>(null);
  const rightEyePathRef = useRef<SVGPathElement | null>(null);
  const frontEarARef = useRef<SVGPathElement | null>(null);
  const frontEarBRef = useRef<SVGPathElement | null>(null);

  const initialScene = useMemo(() => {
    const scene = renderAvatarDefinition(COMPACT_MASCOT_DEFINITION);
    return {
      ...scene,
      colors: { body: bodyColor, eyes: eyeColor },
    };
  }, [bodyColor, eyeColor]);

  const applyScene = useCallback((scene: AvatarScene) => {
    // These are fixed slots for the two pinned diamond ears, not a body-node renderer.
    backEarARef.current?.setAttribute("d", scene.geometry.backPaths[0] ?? "");
    backEarBRef.current?.setAttribute("d", scene.geometry.backPaths[1] ?? "");
    frontEarARef.current?.setAttribute("d", scene.geometry.frontPaths[0] ?? "");
    frontEarBRef.current?.setAttribute("d", scene.geometry.frontPaths[1] ?? "");
    for (const ref of [backEarARef, backEarBRef, frontEarARef, frontEarBRef]) {
      ref.current?.setAttribute("fill", scene.colors.body);
    }
    clipPathRef.current?.setAttribute("d", scene.geometry.headPath);
    headPathRef.current?.setAttribute("d", scene.geometry.headPath);
    headPathRef.current?.setAttribute("fill", scene.colors.body);
    leftEyePathRef.current?.setAttribute("d", scene.geometry.leftPath);
    leftEyePathRef.current?.setAttribute("fill", scene.colors.eyes);
    leftEyePathRef.current?.setAttribute(
      "opacity",
      scene.geometry.leftVisible ? "1" : "0",
    );
    rightEyePathRef.current?.setAttribute("d", scene.geometry.rightPath);
    rightEyePathRef.current?.setAttribute("fill", scene.colors.eyes);
    rightEyePathRef.current?.setAttribute(
      "opacity",
      scene.geometry.rightVisible ? "1" : "0",
    );
  }, []);

  useEffect(() => {
    const runtime = createCompactMascotBehaviorRuntime({
      scheduler: {
        schedule: (callback) => window.requestAnimationFrame(callback),
        cancel: (handle) => window.cancelAnimationFrame(handle),
      },
      now: () => performance.now(),
      random: Math.random,
      colors: { body: bodyColor, eyes: eyeColor },
      getAttentionOffset: (isReduced) => resolveCompactMascotAttention(
        { x: pointerField.x.get(), y: pointerField.y.get() },
        { x: attentionCenterX, y: attentionCenterY },
        isReduced,
      ),
      onScene: applyScene,
    });
    if (reducedMotion) {
      runtime.renderStatic();
      const renderPointerFrame = () => runtime.renderStatic();
      const unsubscribeX = pointerField.x.on("change", renderPointerFrame);
      const unsubscribeY = pointerField.y.on("change", renderPointerFrame);
      return () => {
        unsubscribeX();
        unsubscribeY();
        runtime.dispose();
      };
    }

    if (document.hidden) {
      runtime.pause();
    } else {
      runtime.start();
    }
    const handleVisibilityChange = () => {
      if (document.hidden) {
        runtime.pause();
      } else {
        runtime.start();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      runtime.dispose();
    };
  }, [
    applyScene,
    attentionCenterX,
    attentionCenterY,
    bodyColor,
    eyeColor,
    pointerField,
    reducedMotion,
  ]);

  return (
    <svg
      data-compact-mascot="kirby-cat"
      viewBox={`${-COMPACT_MASCOT_VIEWBOX / 2} ${-COMPACT_MASCOT_VIEWBOX / 2} ${COMPACT_MASCOT_VIEWBOX} ${COMPACT_MASCOT_VIEWBOX}`}
      width={size}
      height={size}
      aria-hidden="true"
      style={{
        display: "block",
        overflow: "visible",
        pointerEvents: "none",
        userSelect: "none",
      }}
    >
      <defs>
        <clipPath id={clipId}>
          <path ref={clipPathRef} d={initialScene.geometry.headPath} />
        </clipPath>
      </defs>
      <path ref={backEarARef} data-compact-mascot-ear="back-0" d={initialScene.geometry.backPaths[0] ?? ""} fill={initialScene.colors.body} />
      <path ref={backEarBRef} data-compact-mascot-ear="back-1" d={initialScene.geometry.backPaths[1] ?? ""} fill={initialScene.colors.body} />
      <path
        ref={headPathRef}
        d={initialScene.geometry.headPath}
        fill={initialScene.colors.body}
      />
      <g clipPath={`url(#${clipId})`}>
        <path
          ref={leftEyePathRef}
          d={initialScene.geometry.leftPath}
          fill={initialScene.colors.eyes}
          opacity={initialScene.geometry.leftVisible ? 1 : 0}
        />
        <path
          ref={rightEyePathRef}
          d={initialScene.geometry.rightPath}
          fill={initialScene.colors.eyes}
          opacity={initialScene.geometry.rightVisible ? 1 : 0}
        />
      </g>
      <path ref={frontEarARef} data-compact-mascot-ear="front-0" d={initialScene.geometry.frontPaths[0] ?? ""} fill={initialScene.colors.body} />
      <path ref={frontEarBRef} data-compact-mascot-ear="front-1" d={initialScene.geometry.frontPaths[1] ?? ""} fill={initialScene.colors.body} />
    </svg>
  );
}
