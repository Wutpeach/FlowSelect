import type { RuntimeDependencyManagedComponent } from "../src/types/runtimeDependencies.js";

export type ManagedPythonPackageToolId = "yt-dlp" | "gallery-dl";

export type ManagedPythonPackageSpec = {
  component: Extract<RuntimeDependencyManagedComponent, "ytDlp" | "galleryDl">;
  installSource: string;
  installSources: readonly string[];
  minPython: [number, number, number];
  packageSetId: string;
  packageVersion: string;
  staleDirectories?: string[];
};

export const MANAGED_PYTHON_PACKAGE_SPECS: Record<ManagedPythonPackageToolId, ManagedPythonPackageSpec> = {
  "yt-dlp": {
    component: "ytDlp",
    installSource: "yt-dlp==2026.07.04",
    installSources: ["yt-dlp==2026.07.04", "yt-dlp-ejs==0.8.0"],
    minPython: [3, 10, 0],
    packageSetId: "yt-dlp==2026.07.04;yt-dlp-ejs==0.8.0",
    packageVersion: "2026.07.04",
    staleDirectories: ["real"],
  },
  "gallery-dl": {
    component: "galleryDl",
    installSource: "gallery-dl==1.32.8",
    installSources: ["gallery-dl==1.32.8"],
    minPython: [3, 8, 0],
    packageSetId: "gallery-dl==1.32.8",
    packageVersion: "1.32.8",
    staleDirectories: ["real"],
  },
};

export const resolvePinnedManagedPythonPackage = (
  toolId: ManagedPythonPackageToolId,
): ManagedPythonPackageSpec => {
  const spec = (MANAGED_PYTHON_PACKAGE_SPECS as Partial<Record<string, ManagedPythonPackageSpec>>)[toolId];
  if (!spec) {
    throw new Error(`Unsupported managed Python package tool: ${toolId}`);
  }
  return spec;
};
