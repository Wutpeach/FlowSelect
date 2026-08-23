import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(import.meta.dirname, "..", "..", "..");
const read = (relative: string): string => readFileSync(path.join(repoRoot, relative), "utf8");

const SURFACE = "src/presentation/main-window/MainWindowPresentationSurface.tsx";
const MASCOT = "src/presentation/main-window/CompactMascot.tsx";
const RUNTIME = "src/presentation/main-window/strobiPlaybackRuntime.ts";

describe("Compact Strobi composition", () => {
  it("atomically mounts the one production Mascot leaf at 56px", () => {
    const surface = read(SURFACE);
    expect(surface).toContain('import { CompactMascot } from "./CompactMascot"');
    expect(surface).toContain("<CompactMascot");
    expect(surface).toContain("COMPACT_MASCOT_VISUAL_SIZE");
    expect(surface).not.toContain("CompactCatCharacter");
    expect(surface).not.toContain("CatIcon");
  });

  it("passes the existing Pointer Field read-only", () => {
    const surface = read(SURFACE);
    expect(surface).toMatch(/pointerField=\{pointerField\}/);
    const mascot = read(MASCOT);
    expect(mascot).not.toContain("updatePointerFieldFromClientPoint");
    expect(mascot).not.toContain("resetPointerFieldToCenter");
  });

  it("keeps the Windows forwarded point write before hotspot evaluation", () => {
    const surface = read(SURFACE);
    const writeIndex = surface.indexOf(
      "updatePointerFieldFromClientPoint(pointerField, clientX, clientY, rect)",
    );
    const hotspotIndex = surface.indexOf("isPointInsideCompactPointerHotspot({");
    expect(writeIndex).toBeGreaterThanOrEqual(0);
    expect(hotspotIndex).toBeGreaterThan(writeIndex);
  });

  it("keeps source playback disposable and outside lifecycle authority", () => {
    const mascot = read(MASCOT);
    const runtime = read(RUNTIME);
    expect(mascot).toContain('document.addEventListener("visibilitychange"');
    expect(mascot).toContain("runtime.pause()");
    expect(mascot).toContain("runtime.dispose()");
    expect(runtime).toContain("pendingFrame === null ? 0 : 1");
    expect(mascot).not.toMatch(/onComplete|onAnimationComplete|visualTransitionCompleted/);
    expect(mascot).not.toContain("dispatch(");
    expect(runtime).not.toContain("dispatch(");
  });

  it("uses static open-eye rendering under Reduced Motion", () => {
    const mascot = read(MASCOT);
    const runtime = read(RUNTIME);
    expect(mascot).toContain("if (reducedMotion)");
    expect(mascot).toContain("runtime.renderStatic()");
    expect(runtime).toContain("reducedMotion ? 1 : frame.blink");
  });

  it("leaves shell presence ownership in the existing surface", () => {
    expect(read(SURFACE)).toContain("compact-icon-settle-");
  });
});
