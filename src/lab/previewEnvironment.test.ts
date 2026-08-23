import { describe, expect, it } from "vitest";
import {
  LAB_ENV_DARK,
  LAB_ENV_LIGHT,
  LAB_PREVIEW_ENVIRONMENT_DEFAULT,
  LAB_PREVIEW_ENVIRONMENTS,
  resolveLabPreviewEnvironmentStyle,
} from "./previewEnvironment";

describe("Lab preview environment", () => {
  it("defaults to dark and lists exactly the three environments", () => {
    expect(LAB_PREVIEW_ENVIRONMENT_DEFAULT).toBe("dark");
    expect(LAB_PREVIEW_ENVIRONMENTS).toEqual(["dark", "light", "checkerboard"]);
  });

  it("resolves dark to the dark chrome backdrop", () => {
    expect(resolveLabPreviewEnvironmentStyle("dark")).toEqual({
      background: LAB_ENV_DARK,
    });
  });

  it("resolves light to a light neutral backdrop", () => {
    expect(resolveLabPreviewEnvironmentStyle("light")).toEqual({
      background: LAB_ENV_LIGHT,
    });
  });

  it("resolves checkerboard as a pure CSS gradient (no image, no canvas)", () => {
    const style = resolveLabPreviewEnvironmentStyle("checkerboard");
    expect(style.background).toContain("repeating-conic-gradient");
    expect(style.backgroundSize).toBe("16px 16px");
  });

  it("stays a chrome-only CSS background with no renderer surface import", () => {
    for (const environment of LAB_PREVIEW_ENVIRONMENTS) {
      const style = resolveLabPreviewEnvironmentStyle(environment);
      expect(typeof style.background).toBe("string");
    }
  });
});
