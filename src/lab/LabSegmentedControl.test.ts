import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const here = import.meta.dirname;
const source = readFileSync(resolve(here, "./LabSegmentedControl.tsx"), "utf8");

describe("Lab Segmented Control", () => {
  it("is a browser-safe toggle group (no canvas, shader, runtime)", () => {
    expect(source).not.toContain("<canvas");
    expect(source).not.toContain("#version");
    expect(source).not.toContain("gl.drawArrays");
    expect(source).not.toContain("createExpandedPresentationRuntime(");
  });

  it("is a role=group of aria-pressed toggle buttons with arrow-key roving", () => {
    expect(source).toContain('role="group"');
    expect(source).toContain("aria-pressed={selected}");
    expect(source).toContain('onKeyDown={handleKeyDown}');
    expect(source).toContain('event.key === "ArrowRight"');
    expect(source).toContain('event.key === "ArrowLeft"');
    expect(source).toContain('event.key === "Home"');
    expect(source).toContain('event.key === "End"');
    expect(source).toContain("tabIndex={selected ? 0 : -1}");
  });

  it("uses the Lab control language and native focus-visible class", () => {
    expect(source).toContain('from "./labControls"');
    expect(source).toContain("getLabChipStyle(colors, { selected, hovered })");
    expect(source).toContain('className="lab-control"');
    expect(source).not.toContain("onFocus=");
    expect(source).toContain("fontWeight: selected ? 700 : 500");
  });
});
