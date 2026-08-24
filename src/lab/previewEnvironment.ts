/** Screen-only Lab backdrop outside the renderer and export capture root. */
import type { CSSProperties } from "react";

export type LabPreviewEnvironment = "dark" | "light" | "checkerboard";

export const LAB_PREVIEW_ENVIRONMENTS: readonly LabPreviewEnvironment[] = [
  "dark",
  "light",
  "checkerboard",
];

export const LAB_PREVIEW_ENVIRONMENT_DEFAULT: LabPreviewEnvironment = "dark";

export const LAB_ENV_DARK = "#151319";
export const LAB_ENV_LIGHT = "#e9e6ef";

export const resolveLabPreviewEnvironmentStyle = (
  environment: LabPreviewEnvironment,
): CSSProperties => {
  switch (environment) {
    case "light":
      return { background: LAB_ENV_LIGHT };
    case "checkerboard":
      return {
        background: "repeating-conic-gradient(#1b1920 0% 25%, #2a2633 0% 50%)",
        backgroundSize: "16px 16px",
      };
    case "dark":
    default:
      return { background: LAB_ENV_DARK };
  }
};
