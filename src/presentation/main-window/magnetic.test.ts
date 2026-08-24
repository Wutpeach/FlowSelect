import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  MAGNETIC_MAX_DISPLACEMENT,
  resolveMagneticTarget,
} from "./magnetic";

const VIEWPORT_SIZE = 200;
const CENTER = { x: 100, y: 100 };

// Magnetic policy semantics are pure and boundary-tested: the consumer is
// full-mode-only via an enabled boolean, and the modules must stay renderer
// local with no desktop/native/lifecycle dependency.

describe("resolveMagneticTarget", () => {
  it("is zero at the stable root center", () => {
    expect(resolveMagneticTarget(CENTER, VIEWPORT_SIZE, true)).toEqual({ x: 0, y: 0 });
  });

  it("points toward the pointer symmetrically", () => {
    const right = resolveMagneticTarget({ x: 160, y: 100 }, VIEWPORT_SIZE, true);
    expect(right.x).toBeGreaterThan(0);
    expect(right.y).toBe(0);

    const left = resolveMagneticTarget({ x: 40, y: 100 }, VIEWPORT_SIZE, true);
    expect(left.x).toBeLessThan(0);
    expect(left.y).toBe(0);

    const up = resolveMagneticTarget({ x: 100, y: 40 }, VIEWPORT_SIZE, true);
    expect(up.x).toBe(0);
    expect(up.y).toBeLessThan(0);
  });

  it("is bounded to the max displacement constant", () => {
    const atEdge = resolveMagneticTarget({ x: 200, y: 100 }, VIEWPORT_SIZE, true);
    expect(Math.abs(atEdge.x)).toBeLessThanOrEqual(MAGNETIC_MAX_DISPLACEMENT);
    expect(atEdge.x).toBeCloseTo(MAGNETIC_MAX_DISPLACEMENT);

    const beyond = resolveMagneticTarget({ x: 500, y: 500 }, VIEWPORT_SIZE, true);
    expect(Math.hypot(beyond.x, beyond.y)).toBeLessThanOrEqual(MAGNETIC_MAX_DISPLACEMENT);
  });

  it("grows with distance inside the response radius", () => {
    const near = resolveMagneticTarget({ x: 110, y: 100 }, VIEWPORT_SIZE, true);
    const far = resolveMagneticTarget({ x: 160, y: 100 }, VIEWPORT_SIZE, true);
    expect(Math.abs(far.x)).toBeGreaterThan(Math.abs(near.x));
  });

  it("resolves to zero when disabled (compact, drag, reduced motion)", () => {
    expect(resolveMagneticTarget({ x: 160, y: 100 }, VIEWPORT_SIZE, false))
      .toEqual({ x: 0, y: 0 });
  });

  it("resolves to zero for invalid input geometry", () => {
    expect(resolveMagneticTarget({ x: Number.NaN, y: 100 }, VIEWPORT_SIZE, true))
      .toEqual({ x: 0, y: 0 });
    expect(resolveMagneticTarget({ x: 160, y: 100 }, 0, true)).toEqual({ x: 0, y: 0 });
  });
});

describe("pointer/magnetic module boundaries", () => {
  const here = dirname(fileURLToPath(import.meta.url));

  it.each(["pointerField.ts", "magnetic.ts"])(
    "%s has no desktop/Electron/native/lifecycle dependency",
    (file) => {
      const source = readFileSync(resolve(here, file), "utf8");
      // Precise import/call shapes only, so comments naming the forbidden
      // concepts do not trip the guard.
      const forbidden = [
        /from ["'][^"']*(?:desktop\/runtime|electron)["']/,
        /BrowserWindow/,
        /setPosition|setBounds|animateBounds/,
        /window\.ameow/,
        /from ["']\.\/lifecycle["']/,
        /from ["']\.\/effectContracts["']/,
        /from ["']\.\/effectExecutor["']/,
      ];
      for (const pattern of forbidden) {
        expect(source, `unexpected ${pattern} in ${file}`).not.toMatch(pattern);
      }
    },
  );
});

describe("edge glow removal", () => {
  const here = dirname(fileURLToPath(import.meta.url));

  it("leaves no pointer-following edge glow identifiers in the surface", () => {
    const source = readFileSync(
      resolve(here, "MainWindowPresentationSurface.tsx"),
      "utf8",
    );
    expect(source).not.toMatch(/[eE]dgeGlow|EDGE_GLOW|edge glow/);
  });

  it("removes the obsolete edge glow modules", () => {
    expect(existsSync(resolve(here, "motionRuntime.ts"))).toBe(false);
    expect(existsSync(resolve(here, "motionRuntime.test.ts"))).toBe(false);
    expect(existsSync(resolve(here, "..", "..", "utils", "mainWindowEdgeGlowPosition.ts"))).toBe(false);
    expect(existsSync(resolve(here, "..", "..", "utils", "mainWindowEdgeGlowPosition.test.ts"))).toBe(false);
  });
});
