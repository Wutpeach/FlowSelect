import { describe, expect, it } from "vitest";
import type { ThemeColors } from "../contexts/ThemeContext";
import { getLabChipStyle } from "./labControls";

const colors = {
  bgPrimary: "bg-primary",
  bgSecondary: "bg-secondary",
  fieldBg: "field-bg",
  fieldInset: "field-inset",
  borderStart: "border-start",
  fieldBorder: "field-border",
  fieldBorderStrong: "field-border-strong",
  textPrimary: "text-primary",
  textSecondary: "text-secondary",
  panelShadow: "panel-shadow",
  accentSurface: "accent-surface",
  accentSurfaceStrong: "accent-surface-strong",
  accentBorder: "accent-border",
} as ThemeColors;

describe("Lab control chip style", () => {
  it("reuses theme-backed selectable option styles", () => {
    const normal = getLabChipStyle(colors);
    const selected = getLabChipStyle(colors, { selected: true });
    const hovered = getLabChipStyle(colors, { hovered: true });

    expect(normal.border).toContain(colors.fieldBorder);
    expect(selected.background).toContain(colors.accentSurfaceStrong);
    expect(selected.boxShadow).toContain(colors.accentBorder);
    expect(hovered.border).toContain(colors.borderStart);
    expect(normal.outline).toBeUndefined();
    expect(normal["--lab-focus-ring"]).toBe(colors.accentBorder);
  });

  it("dims disabled chips without making them selected", () => {
    const disabled = getLabChipStyle(colors, { disabled: true, selected: true });
    expect(disabled.cursor).toBe("default");
    expect(disabled.opacity).toBe(0.4);
    expect(disabled.color).toBe(colors.textSecondary);
  });
});
