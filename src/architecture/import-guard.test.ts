import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Architecture regression guard: Domain (`src/core`) and Application
 * (`src/orchestration`, `src/engines`, `src/sites`) must stay runtime-neutral
 * and may never import Electron, project Electron modules, `src/electron-runtime`
 * implementations, or renderer/protocol payload modules (`src/types`,
 * `src/protocol`). Infrastructure may import Domain/Application, never the
 * reverse.
 *
 * This is a static import-scan test because ESLint `no-restricted-imports`
 * cannot reliably match the relative specifier spellings used across depths.
 * The whole mixed `src/download-capabilities` directory is intentionally not
 * guarded: `probe.ts` spawns downloader binaries, which is Infrastructure
 * behavior.
 */

const repoRoot = path.resolve(import.meta.dirname, "..", "..");
const srcRoot = path.join(repoRoot, "src");

const GUARDED_DIRS = ["core", "orchestration", "engines", "sites", "application"];

const FORBIDDEN_PACKAGE_PREFIXES = ["electron"];

const FORBIDDEN_SRC_DIRS = ["electron-runtime", "types", "protocol"];

const FORBIDDEN_PROJECT_DIR = "electron";

const IMPORT_PATTERN =
  /(?:import|export)\s+(?:type\s+)?[^'"]*?from\s*['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

const collectSourceFiles = (dir: string): string[] => {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectSourceFiles(fullPath));
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      files.push(fullPath);
    }
  }
  return files;
};

const toRepoRelative = (target: string): string => {
  const relative = path.relative(repoRoot, target).replace(/\\/g, "/");
  return relative.startsWith("..") ? `[outside-repo]${relative}` : relative;
};

const describeViolation = (file: string, specifier: string, target: string): string => (
  `${toRepoRelative(file)} imports "${specifier}" -> forbidden target ${toRepoRelative(target)}`
);

/**
 * Resolves a specifier to the on-disk file it names. Source imports use `.js`
 * specifiers pointing at `.ts` sources, and the Electron host is `.mts`, so
 * both spellings (and the extensionless form) are tried before giving up.
 * Node built-ins resolve to null and stay allowed.
 */
const resolveSpecifierTarget = (
  file: string,
  specifier: string,
): string | null => {
  if (specifier.startsWith(".")) {
    const base = path.resolve(path.dirname(file), specifier);
    const candidates = [
      base,
      `${base}.ts`,
      `${base}.tsx`,
      `${base}.mts`,
      `${base}.js`,
      base.replace(/\.js$/, ".ts"),
      base.replace(/\.js$/, ".tsx"),
      base.replace(/\.js$/, ".mts"),
    ];
    const existing = candidates.find((candidate) => {
      try {
        return statSync(candidate).isFile();
      } catch {
        return false;
      }
    });
    return existing ?? null;
  }
  if (specifier.startsWith("node:")) {
    return null;
  }
  return path.join(repoRoot, "node_modules", specifier.split("/")[0]);
};

/**
 * Scans one source file for imports that would pull Electron, the runtime
 * implementation, or renderer/protocol payload modules into Domain/Application.
 * Exported so the guard logic is provable against representative specifiers.
 */
export const collectRuntimeImportViolations = (
  source: string,
  file: string,
): string[] => {
  const violations: string[] = [];

  for (const match of source.matchAll(IMPORT_PATTERN)) {
    const specifier = (match[1] ?? match[2]).trim();
    if (!specifier) {
      continue;
    }

    // Bare Electron package imports.
    if (FORBIDDEN_PACKAGE_PREFIXES.some((prefix) => (
      specifier === prefix || specifier.startsWith(`${prefix}/`)
    ))) {
      violations.push(`${toRepoRelative(file)} imports "${specifier}" (forbidden package)`);
      continue;
    }

    const target = resolveSpecifierTarget(file, specifier);
    if (!target) {
      continue;
    }
    const repoRelative = toRepoRelative(target);

    // Project `electron/` directory modules (electron/main.mts etc.).
    if (repoRelative === FORBIDDEN_PROJECT_DIR || repoRelative.startsWith(`${FORBIDDEN_PROJECT_DIR}/`)) {
      violations.push(describeViolation(file, specifier, target));
      continue;
    }

    // Infrastructure and renderer/protocol payload directories.
    if (FORBIDDEN_SRC_DIRS.some((forbidden) => (
      repoRelative === `src/${forbidden}` || repoRelative.startsWith(`src/${forbidden}/`)
    ))) {
      violations.push(describeViolation(file, specifier, target));
      continue;
    }
  }

  return violations;
};

const scanGuardedDir = (dir: string): string[] => {
  const violations: string[] = [];
  for (const file of collectSourceFiles(path.join(srcRoot, dir))) {
    violations.push(...collectRuntimeImportViolations(readFileSync(file, "utf8"), file));
  }
  return violations;
};

describe("runtime-neutral import guard", () => {
  it("blocks Domain/Application imports of Electron, runtime, or protocol payload modules", () => {
    const violations = GUARDED_DIRS.flatMap(scanGuardedDir);

    expect(violations, [
      "Domain/Application must not depend on Electron, electron-runtime, or protocol payload modules.",
      ...violations,
    ].join("\n")).toEqual([]);
  });

  it("scans the application directory against the same forbidden imports", () => {
    const violations = scanGuardedDir("application");
    expect(violations, [
      "Application must stay Electron-neutral: no Electron, electron-runtime, or protocol payload imports.",
      ...violations,
    ].join("\n")).toEqual([]);
  });

  it("blocks Domain (src/core) imports of Application layers", () => {
    const violations: string[] = [];
    const applicationDirs = ["orchestration", "engines", "sites", "download-capabilities", "config", "application"];

    for (const file of collectSourceFiles(path.join(srcRoot, "core"))) {
      const source = readFileSync(file, "utf8");
      for (const match of source.matchAll(IMPORT_PATTERN)) {
        const specifier = (match[1] ?? match[2]).trim();
        if (!specifier || !specifier.startsWith(".")) {
          continue;
        }
        const target = resolveSpecifierTarget(file, specifier);
        if (!target) {
          continue;
        }
        const repoRelative = toRepoRelative(target);
        if (applicationDirs.some((dir) => (
          repoRelative === `src/${dir}` || repoRelative.startsWith(`src/${dir}/`)
        ))) {
          violations.push(describeViolation(file, specifier, target));
        }
      }
    }

    expect(violations, [
      "Domain (src/core) must not import Application layers.",
      ...violations,
    ].join("\n")).toEqual([]);
  });

  it("flags representative forbidden specifiers in real repo spellings", () => {
    const coreFile = path.join(srcRoot, "core", "fake.ts");
    const flag = (source: string, expectedTarget: string): void => {
      const violations = collectRuntimeImportViolations(source, coreFile);
      expect(violations, `expected a violation for ${expectedTarget}`).toHaveLength(1);
      expect(violations[0]).toContain(expectedTarget);
    };

    // `.js` specifier pointing at a `.ts` source in the runtime.
    flag(
      'import { runYtDlpDownload } from "../electron-runtime/ytDlpDownload.js";',
      "src/electron-runtime/ytDlpDownload.ts",
    );
    // `.mts` specifier pointing at the Electron host (repo-root sibling of src/).
    flag(
      'import { bootstrapMain } from "../../electron/main.mts";',
      "electron/main.mts",
    );
    // `.js` specifier pointing at renderer/protocol payload modules.
    flag(
      'import type { VideoQueueDetailPayload } from "../types/electronBridge.js";',
      "src/types/electronBridge.ts",
    );
    // `.js` specifier pointing at the protocol download DTOs.
    flag(
      'import type { VideoQueueDetailPayload } from "../protocol/download/ipcTypes.js";',
      "src/protocol/download/ipcTypes.ts",
    );
    // `.js` specifier pointing at the protocol compatibility mappers.
    flag(
      'import { decodeQueueDownloadCommand } from "../protocol/download/ipcMappers.js";',
      "src/protocol/download/ipcMappers.ts",
    );
    // Project Electron download adapters.
    flag(
      'import { createDownloadIpcAdapter } from "../../electron/downloadIpcAdapter.mts";',
      "electron/downloadIpcAdapter.mts",
    );
    flag(
      'import { createDownloadWsAdapter } from "../../electron/downloadWsAdapter.mts";',
      "electron/downloadWsAdapter.mts",
    );
    // Bare Electron package import; node built-ins stay allowed.
    expect(collectRuntimeImportViolations(
      'import { app } from "electron";\nimport { readFileSync } from "node:fs";',
      coreFile,
    )).toEqual([`src/core/fake.ts imports "electron" (forbidden package)`]);
  });

  it("enforces the guard at Site and Application layers in real specifier spellings", () => {
    const sitesFile = path.join(srcRoot, "sites", "fake.ts");
    const applicationFile = path.join(srcRoot, "application", "fake.ts");
    const flag = (source: string, file: string, expectedTarget: string): void => {
      const violations = collectRuntimeImportViolations(source, file);
      expect(violations, `expected a violation for ${expectedTarget}`).toHaveLength(1);
      expect(violations[0]).toContain(expectedTarget);
    };

    // Site layer -> concrete engine adapter.
    flag(
      'import { buildYtDlpEngineAdapter } from "../electron-runtime/ytDlpEngineAdapter.js";',
      sitesFile,
      "src/electron-runtime/ytDlpEngineAdapter.ts",
    );
    // Application layer -> protocol download DTO.
    flag(
      'import type { VideoQueueDetailPayload } from "../protocol/download/ipcTypes.js";',
      applicationFile,
      "src/protocol/download/ipcTypes.ts",
    );
    // Application layer -> concrete engine adapter.
    flag(
      'import { buildYtDlpEngineAdapter } from "../electron-runtime/ytDlpEngineAdapter.js";',
      applicationFile,
      "src/electron-runtime/ytDlpEngineAdapter.ts",
    );
  });
});

/**
 * P4 feature boundary guard. Renderer features (`src/features/**`) own their
 * lifecycle and UI state; they must never depend on Electron, the project
 * `electron/` host, `src/electron-runtime` implementations, Domain/Engine
 * infrastructure (`src/core`, `src/engines`, `src/download-capabilities`), or
 * another feature's internal paths. Top-level feature files are the explicit
 * public surface for app-level composition.
 *
 * Download `model`/`reducer`/`selectors` additionally must not import
 * `src/protocol` or desktop runtime modules (`src/desktop`): protocol DTOs
 * stop at the concrete client adapter and never become feature state.
 */

const FEATURES_ROOT = path.join(srcRoot, "features");

const FEATURE_FORBIDDEN_SRC_DIRS = ["core", "engines", "download-capabilities", "electron-runtime"];

const DOWNLOAD_STATE_MODULES = [
  "src/features/download/model.ts",
  "src/features/download/reducer.ts",
  "src/features/download/selectors.ts",
];

const DOWNLOAD_STATE_FORBIDDEN_SRC_DIRS = ["protocol", "desktop", "electron-runtime"];

const featureDirOf = (file: string): string | null => {
  const relative = path.relative(FEATURES_ROOT, file).replace(/\\/g, "/");
  const firstSegment = relative.split("/")[0];
  return firstSegment && firstSegment !== ".." ? firstSegment : null;
};

/**
 * Scans one feature file for imports that would pull Electron, the runtime
 * implementation, Domain/Engine infrastructure, or another feature's internal
 * paths into the feature layer. Exported so the guard logic is provable
 * against representative specifiers.
 */
export const collectFeatureImportViolations = (
  source: string,
  file: string,
): string[] => {
  const violations: string[] = [];
  const featureDir = featureDirOf(file);

  for (const match of source.matchAll(IMPORT_PATTERN)) {
    const specifier = (match[1] ?? match[2]).trim();
    if (!specifier) {
      continue;
    }

    // Bare Electron package imports.
    if (FORBIDDEN_PACKAGE_PREFIXES.some((prefix) => (
      specifier === prefix || specifier.startsWith(`${prefix}/`)
    ))) {
      violations.push(`${toRepoRelative(file)} imports "${specifier}" (forbidden package)`);
      continue;
    }

    // Cross-feature internal imports are banned; top-level feature files are
    // the explicit public surface for app-level composition. Checked at
    // specifier level so it also covers not-yet-existing targets (only one
    // feature exists today, so it cannot fire on real code).
    if (featureDir && specifier.startsWith(".")) {
      const unresolvedTarget = toRepoRelative(path.resolve(path.dirname(file), specifier));
      const otherFeaturePrefix = unresolvedTarget.startsWith("src/features/")
        ? `src/features/${unresolvedTarget.slice("src/features/".length).split("/")[0]}/`
        : null;
      const remainder = otherFeaturePrefix && unresolvedTarget.startsWith(otherFeaturePrefix)
        ? unresolvedTarget.slice(otherFeaturePrefix.length)
        : null;
      if (remainder !== null && remainder.includes("/")) {
        violations.push(`${toRepoRelative(file)} imports "${specifier}" -> forbidden target ${unresolvedTarget}`);
      }
    }

    const target = resolveSpecifierTarget(file, specifier);
    if (!target) {
      continue;
    }
    const repoRelative = toRepoRelative(target);

    // Project `electron/` directory modules (electron/main.mts etc.).
    if (repoRelative === FORBIDDEN_PROJECT_DIR || repoRelative.startsWith(`${FORBIDDEN_PROJECT_DIR}/`)) {
      violations.push(describeViolation(file, specifier, target));
      continue;
    }

    // Infrastructure/Domain/Engine and runtime implementation directories.
    if (FEATURE_FORBIDDEN_SRC_DIRS.some((forbidden) => (
      repoRelative === `src/${forbidden}` || repoRelative.startsWith(`src/${forbidden}/`)
    ))) {
      violations.push(describeViolation(file, specifier, target));
      continue;
    }
  }

  return violations;
};

const scanFeaturesDir = (): string[] => {
  const violations: string[] = [];
  for (const file of collectSourceFiles(FEATURES_ROOT)) {
    violations.push(...collectFeatureImportViolations(readFileSync(file, "utf8"), file));
  }
  return violations;
};

/**
 * Scans the Download lifecycle state modules for protocol/desktop runtime
 * imports. These files must stay protocol-free so DTOs never become
 * long-lived feature state.
 */
export const collectDownloadStateViolations = (source: string, file: string): string[] => {
  const violations: string[] = [];
  for (const match of source.matchAll(IMPORT_PATTERN)) {
    const specifier = (match[1] ?? match[2]).trim();
    if (!specifier) {
      continue;
    }
    const target = resolveSpecifierTarget(file, specifier);
    if (!target) {
      continue;
    }
    const repoRelative = toRepoRelative(target);
    if (DOWNLOAD_STATE_FORBIDDEN_SRC_DIRS.some((forbidden) => (
      repoRelative === `src/${forbidden}` || repoRelative.startsWith(`src/${forbidden}/`)
    ))) {
      violations.push(describeViolation(file, specifier, target));
    }
  }
  return violations;
};

describe("P4 feature import guard", () => {
  it("keeps all feature files free of Electron, runtime, and Domain/Engine imports", () => {
    const violations = scanFeaturesDir();
    expect(violations, [
      "Feature files must not depend on Electron, electron-runtime, or Domain/Engine infrastructure.",
      ...violations,
    ].join("\n")).toEqual([]);
  });

  it("keeps Download model/reducer/selectors free of protocol and desktop runtime imports", () => {
    const violations: string[] = [];
    for (const relative of DOWNLOAD_STATE_MODULES) {
      const file = path.join(repoRoot, relative);
      violations.push(...collectDownloadStateViolations(readFileSync(file, "utf8"), file));
    }
    expect(violations, [
      "Download model/reducer/selectors must not import src/protocol or desktop runtime modules.",
      ...violations,
    ].join("\n")).toEqual([]);
  });

  it("flags representative forbidden feature specifiers in real repo spellings", () => {
    const featureFile = path.join(srcRoot, "features", "download", "fake.ts");
    const flag = (source: string, expectedTarget: string): void => {
      const violations = collectFeatureImportViolations(source, featureFile);
      expect(violations, `expected a violation for ${expectedTarget}`).toHaveLength(1);
      expect(violations[0]).toContain(expectedTarget);
    };

    flag('import { app } from "electron";', "forbidden package");
    flag(
      'import { runYtDlpDownload } from "../../electron-runtime/ytDlpDownload.js";',
      "src/electron-runtime/ytDlpDownload.ts",
    );
    flag(
      'import { bootstrapMain } from "../../../electron/main.mts";',
      "electron/main.mts",
    );
    // Domain (src/core) and Engine (src/engines) infrastructure.
    flag(
      'import { isVideoUrl } from "../../core/video-candidate-normalization.js";',
      "src/core/video-candidate-normalization.ts",
    );
    flag(
      'import { selectEngine } from "../../engines/engine-registry.js";',
      "src/engines/engine-registry.ts",
    );
    // Downloader infrastructure.
    flag(
      'import { probeDownloader } from "../../download-capabilities/probe.js";',
      "src/download-capabilities/probe.ts",
    );
    // Another feature's internal path is banned; top-level feature files stay allowed.
    flag(
      'import { useTranscode } from "../transcode/components/useTranscode.js";',
      "src/features/transcode/components/useTranscode.js",
    );
    expect(collectFeatureImportViolations(
      'import { useTranscode } from "../transcode/useTranscode.js";',
      featureFile,
    )).toEqual([]);
  });

  it("flags protocol/desktop imports in Download lifecycle state modules", () => {
    const stateFile = path.join(srcRoot, "features", "download", "model.ts");
    const flag = (source: string, expectedTarget: string): void => {
      const violations = collectDownloadStateViolations(source, stateFile);
      expect(violations, `expected a violation for ${expectedTarget}`).toHaveLength(1);
      expect(violations[0]).toContain(expectedTarget);
    };

    flag(
      'import type { VideoQueueDetailPayload } from "../../protocol/download/ipcTypes.js";',
      "src/protocol/download/ipcTypes.ts",
    );
    flag(
      'import { desktopEvents } from "../../desktop/runtime.js";',
      "src/desktop/runtime.ts",
    );
  });
});

/**
 * P6 reverse guard. The concrete per-engine files in `src/electron-runtime`
 * (adapters, runners, download commands) are per-engine Infrastructure: each
 * executes one CLI and must never reach into Site providers (`src/sites`) or
 * renderer features (`src/features`). The scan covers only those concrete
 * files, never the service/composition layer, which legitimately composes
 * providers and the registry.
 */

const RUNTIME_CONCRETE_FILE_PATTERN = /(?:EngineAdapter|EngineRunner|Download)\.ts$/;

const RUNTIME_FORBIDDEN_SRC_DIRS = ["sites", "features"];

/**
 * Scans one concrete engine file for imports that would pull Site providers or
 * renderer features into per-engine Infrastructure. Exported so the guard
 * logic is provable against representative specifiers. Resolution is done at
 * specifier level (matching the cross-feature check) so it also covers
 * not-yet-existing targets.
 */
export const collectConcreteEngineImportViolations = (
  source: string,
  file: string,
): string[] => {
  const violations: string[] = [];
  for (const match of source.matchAll(IMPORT_PATTERN)) {
    const specifier = (match[1] ?? match[2]).trim();
    if (!specifier || !specifier.startsWith(".")) {
      continue;
    }
    const unresolvedTarget = toRepoRelative(path.resolve(path.dirname(file), specifier));
    if (RUNTIME_FORBIDDEN_SRC_DIRS.some((forbidden) => (
      unresolvedTarget === `src/${forbidden}` || unresolvedTarget.startsWith(`src/${forbidden}/`)
    ))) {
      violations.push(`${toRepoRelative(file)} imports "${specifier}" -> forbidden target ${unresolvedTarget}`);
    }
  }
  return violations;
};

const scanConcreteEngineFiles = (): string[] => {
  const violations: string[] = [];
  for (const file of collectSourceFiles(path.join(srcRoot, "electron-runtime"))) {
    if (!RUNTIME_CONCRETE_FILE_PATTERN.test(file)) {
      continue;
    }
    violations.push(...collectConcreteEngineImportViolations(readFileSync(file, "utf8"), file));
  }
  return violations;
};

describe("P6 concrete engine import guard", () => {
  it("keeps concrete engine adapters/runners/downloads free of Site and feature imports", () => {
    const violations = scanConcreteEngineFiles();
    expect(violations, [
      "Concrete engine files must not import src/sites or src/features.",
      ...violations,
    ].join("\n")).toEqual([]);
  });

  it("flags Site and feature imports from concrete engine files", () => {
    const adapterFile = path.join(srcRoot, "electron-runtime", "fakeEngineAdapter.ts");
    const runnerFile = path.join(srcRoot, "electron-runtime", "fakeEngineRunner.ts");
    const downloadFile = path.join(srcRoot, "electron-runtime", "fakeEngineDownload.ts");
    const flag = (source: string, file: string, expectedTarget: string): void => {
      const violations = collectConcreteEngineImportViolations(source, file);
      expect(violations, `expected a violation for ${expectedTarget}`).toHaveLength(1);
      expect(violations[0]).toContain(expectedTarget);
    };

    flag(
      'import { resolveYoutubeProvider } from "../sites/youtube.js";',
      adapterFile,
      "src/sites/youtube.js",
    );
    flag(
      'import { selectDownloadModel } from "../features/download/model.js";',
      downloadFile,
      "src/features/download/model.js",
    );
    // Unrelated relative imports stay allowed.
    expect(collectConcreteEngineImportViolations(
      'import { classifyNetworkFailure } from "../config/networkRoute.js";',
      runnerFile,
    )).toEqual([]);
  });
});
/**
 * MR0 renderer-local motion guard. The committed M0/M1/M2 renderer-local
 * motion leaves share one rule set:
 *   - no runtime imports of Product dispatch (`src/features/`), Main Window
 *     lifecycle/pointer authority modules, the center-overlay policy module,
 *     the desktop runtime, `src/electron-runtime`, or Electron;
 *   - no position/bounds/DOM coordinate reads and no IPC side channels;
 *   - authority writers stay unique: lifecycle state is reduced only by the
 *     react adapter, and the Pointer Field is written only by the
 *     presentation surface (which is also the only file allowed to import the
 *     writer helpers at runtime).
 * `MainWindowPresentationSurface` is the wiring/composition boundary: it may
 * consume authority shapes and the desktop runtime, but it must not import
 * Product dispatch.
 *
 * The Pointer Field is intentionally NOT in the forbidden prefixes below:
 * `magnetic.ts` (and future Character consumers) legitimately consume the
 * sole continuous pointer authority at runtime.
 *
 * The M3 candidate modules are NOT listed here: the M3 guard above already
 * restricts their authority imports, and MR0 must not freeze candidate
 * visual modules under extra rules. Their non-promotion is pinned by the
 * authority-side test below.
 */

const MR0_MOTION_LEAF_MODULES = [
  // Committed M0/M1/M2 renderer-local motion leaves. M3 candidate modules
  // stay under the M3 guard above, not under MR0 rules.
  "src/presentation/main-window/pointerField.ts",
  "src/presentation/main-window/magnetic.ts",
  "src/presentation/main-window/geometry.ts",
  "src/presentation/main-window/motionRecipes.ts",
  "src/presentation/main-window/panelHover.ts",
  // MR7 Expanded Presentation: neutral targets + consumer-local frame state.
  // The concrete WebGL2 host is a DOM/resource boundary and is guarded below.
  "src/presentation/main-window/expandedPresentationTargets.ts",
  "src/presentation/main-window/expandedPresentationRuntime.ts",
  // MR3 Progress: the pure Download -> Presentation target projection.
  // It imports Download types type-only (erased at compile time) and never
  // dispatches, reduces, cancels, or writes lifecycle/native state.
  "src/presentation/main-window/downloadProgressProjection.ts",
  // MR4 Terminal: the pure center-outcome -> Presentation target projection.
  // It imports center-overlay types type-only
  // (erased at compile time) and never classifies, dispatches, reduces,
  // cancels, retains, or writes lifecycle/native state.
  "src/presentation/main-window/downloadTerminalProjection.ts",
  // Compact Kirby cat: pinned source definition, pure attention projection, and
  // source-specific playback scheduler. The SVG host (CompactMascot.tsx) is a
  // DOM boundary because it reads document visibility; it stays outside this
  // pure-leaf list and is pinned by the wiring-boundary assertions.
  "src/presentation/main-window/compactMascotRecipe.ts",
  "src/presentation/main-window/compactMascotDefinition.ts",
  "src/presentation/main-window/compactMascotBehaviorRuntime.ts",
];

const MR0_FORBIDDEN_SRC_PREFIXES = [
  "src/features/",
  "src/desktop/",
  "src/electron-runtime/",
  "src/utils/centerOverlayState.ts",
  "src/presentation/main-window/lifecycle.ts",
  "src/presentation/main-window/projections.ts",
  "src/presentation/main-window/effectContracts.ts",
  "src/presentation/main-window/effectExecutor.ts",
];

const MR0_FORBIDDEN_SIDE_CHANNEL_PATTERN = /ipcRenderer|ipcMain|\.invoke\(|\.send\(/;

/**
 * Position/bounds/DOM-coordinate ban for the renderer-local leaf set: leaves
 * receive plain numeric parameters only and must never call position/bounds
 * APIs or read DOM/screen/native coordinates themselves. (The M3 guard that
 * originally owned this pattern was removed with the M3 candidates; the MR0
 * leaf set keeps the same ban inline.)
 */
const MR0_FORBIDDEN_POSITION_CALL_PATTERN =
  /\.(?:getBoundingClientRect|getClientRects)\(|(?:window|document|screen|navigator|devicePixelRatio)\.|\.(?:clientX|clientY|pageX|pageY|screenX|screenY|offsetX|offsetY)\b/;

/** Type-only imports are erased at compile time and stay allowed in leaves. */
const TYPE_ONLY_IMPORT_PATTERN = /import\s+type\s+[^'"]*?from\s*['"]([^'"]+)['"]/g;

/**
 * Scans one renderer-local motion leaf for runtime imports that would pull
 * Product dispatch, lifecycle/pointer authority, the center-overlay policy,
 * the desktop runtime, or Electron into renderer-local motion code. Type-only
 * imports (erased at compile time) stay allowed.
 */
export const collectMotionLeafImportViolations = (
  source: string,
  file: string,
): string[] => {
  const violations: string[] = [];
  const typeOnlySpecifiers = new Set(
    [...source.matchAll(TYPE_ONLY_IMPORT_PATTERN)].map((match) => match[1]),
  );

  for (const match of source.matchAll(IMPORT_PATTERN)) {
    const specifier = (match[1] ?? match[2]).trim();
    if (!specifier || typeOnlySpecifiers.has(specifier)) {
      continue;
    }

    if (FORBIDDEN_PACKAGE_PREFIXES.some((prefix) => (
      specifier === prefix || specifier.startsWith(`${prefix}/`)
    ))) {
      violations.push(`${toRepoRelative(file)} imports "${specifier}" (forbidden package)`);
      continue;
    }

    const target = resolveSpecifierTarget(file, specifier);
    if (!target) {
      continue;
    }
    const repoRelative = toRepoRelative(target);
    if (repoRelative === FORBIDDEN_PROJECT_DIR || repoRelative.startsWith(`${FORBIDDEN_PROJECT_DIR}/`)) {
      violations.push(describeViolation(file, specifier, target));
      continue;
    }
    if (MR0_FORBIDDEN_SRC_PREFIXES.some((forbidden) => (
      repoRelative === forbidden || repoRelative.startsWith(forbidden)
    ))) {
      violations.push(describeViolation(file, specifier, target));
    }
  }
  return violations;
};

const scanMotionLeafModules = (): string[] => {
  const violations: string[] = [];
  for (const relative of MR0_MOTION_LEAF_MODULES) {
    const file = path.join(repoRoot, relative);
    violations.push(
      ...collectMotionLeafImportViolations(readFileSync(file, "utf8"), file),
    );
  }
  return violations;
};

const isTestFile = (file: string): boolean => (
  /\.(?:test|spec)\.(?:ts|tsx|mts)$/.test(file)
);

const scanAllProductionFiles = (): string[] => collectSourceFiles(srcRoot)
  .filter((file) => !isTestFile(file));

describe("MR0 renderer-local motion guard", () => {
  it("keeps renderer-local motion leaves free of Product/lifecycle/desktop/Electron runtime imports", () => {
    const violations = scanMotionLeafModules();
    expect(violations, [
      "Renderer-local motion modules must not depend on Product dispatch, lifecycle/pointer authority, center-overlay policy, desktop runtime, or Electron modules.",
      ...violations,
    ].join("\n")).toEqual([]);
  });

  it("keeps renderer-local motion leaves free of position/bounds/DOM coordinate and IPC side-channel calls", () => {
    for (const relative of MR0_MOTION_LEAF_MODULES) {
      const source = readFileSync(path.join(repoRoot, relative), "utf8");
      expect(
        MR0_FORBIDDEN_POSITION_CALL_PATTERN.test(source),
        `${relative} must not call position/bounds APIs or read DOM/screen coordinates`,
      ).toBe(false);
      expect(
        MR0_FORBIDDEN_SIDE_CHANNEL_PATTERN.test(source),
        `${relative} must not open IPC side channels`,
      ).toBe(false);
    }
  });

  it("keeps the MR3 progress projection free of authority vocabulary", () => {
    const projectionFile = path.join(
      repoRoot,
      "src/presentation/main-window/downloadProgressProjection.ts",
    );
    const source = readFileSync(projectionFile, "utf8");
    const authorityPattern = /dispatch|reduceDownload|\.cancel\(|setState|requestFull|ipcRenderer|ipcMain|\.invoke\(/;
    expect(
      authorityPattern.test(source),
      "downloadProgressProjection must contain no dispatch/reduce/cancel/lifecycle/native/React-state authority vocabulary",
    ).toBe(false);
  });

  it("keeps the MR4 terminal projection free of authority vocabulary", () => {
    const projectionFile = path.join(
      repoRoot,
      "src/presentation/main-window/downloadTerminalProjection.ts",
    );
    const source = readFileSync(projectionFile, "utf8");
    const authorityPattern = /dispatch|reduceDownload|\.cancel\(|setState|requestFull|ipcRenderer|ipcMain|\.invoke\(/;
    expect(
      authorityPattern.test(source),
      "downloadTerminalProjection must contain no classify/dispatch/reduce/cancel/lifecycle/native/React-state authority vocabulary",
    ).toBe(false);
  });

  it("keeps the presentation surface wiring boundary: no Product dispatch imports", () => {
    const surfaceFile = path.join(
      repoRoot,
      "src/presentation/main-window/MainWindowPresentationSurface.tsx",
    );
    const source = readFileSync(surfaceFile, "utf8");
    const violations: string[] = [];
    for (const match of source.matchAll(IMPORT_PATTERN)) {
      const specifier = (match[1] ?? match[2]).trim();
      if (!specifier || !specifier.startsWith(".")) {
        continue;
      }
      const target = resolveSpecifierTarget(surfaceFile, specifier);
      if (!target) {
        continue;
      }
      const repoRelative = toRepoRelative(target);
      if (repoRelative === "src/features" || repoRelative.startsWith("src/features/")) {
        violations.push(describeViolation(surfaceFile, specifier, target));
      }
    }
    expect(violations, [
      "MainWindowPresentationSurface must remain wiring/composition: no Product dispatch (src/features) imports.",
      ...violations,
    ].join("\n")).toEqual([]);
  });

  it("keeps the Expanded graphics host free of Product/lifecycle/effects/desktop/Electron/pointer-authority imports and IPC side channels", () => {
    const hostFile = path.join(
      repoRoot,
      "src/presentation/main-window/ExpandedPresentationSurface.tsx",
    );
    const source = readFileSync(hostFile, "utf8");

    // The FULL leaf rule set (Product dispatch, lifecycle/effects/desktop/
    // center-overlay authority, electron-runtime, Electron package+host)...
    const violations = collectMotionLeafImportViolations(source, hostFile);

    // ...plus the one authority the leaves may consume but the canvas host
    // must never write: the Pointer Field writer.
    for (const match of source.matchAll(IMPORT_PATTERN)) {
      const specifier = (match[1] ?? match[2]).trim();
      if (!specifier) {
        continue;
      }
      const target = resolveSpecifierTarget(hostFile, specifier);
      if (!target) {
        continue;
      }
      if (toRepoRelative(target) === "src/presentation/main-window/pointerField.ts") {
        violations.push(describeViolation(hostFile, specifier, target));
      }
    }
    expect(violations, [
      "ExpandedPresentationSurface must stay a renderer-local decorative host: no Product/lifecycle/effects/desktop/Electron or Pointer Field writer imports.",
      ...violations,
    ].join("\n")).toEqual([]);

    // The host schedules local frames only — no IPC side channels.
    expect(
      MR0_FORBIDDEN_SIDE_CHANNEL_PATTERN.test(source),
      "ExpandedPresentationSurface must not open IPC side channels",
    ).toBe(false);
  });

  it("retires Dot Field atomically and keeps exactly one production Expanded graphics host", () => {
    const retiredFiles = [
      "DotFieldCanvas.tsx",
      "dotFieldRuntime.ts",
      "dotFieldRecipe.ts",
      "dotFieldSurface.ts",
    ].map((name) => path.join(repoRoot, "src/presentation/main-window", name));
    expect(retiredFiles.filter(existsSync), "retired Dot Field modules must not remain").toEqual([]);

    const productionSources = collectSourceFiles(srcRoot)
      .filter((file) => !/\.test\.(ts|tsx)$/.test(file));
    const dotFieldReferences = productionSources
      .filter((file) => /DotField|dotField/.test(readFileSync(file, "utf8")))
      .map(toRepoRelative);
    expect(dotFieldReferences, "production must have zero Dot Field references").toEqual([]);

    const hostImports = productionSources.filter((file) => (
      readFileSync(file, "utf8").includes('from "./ExpandedPresentationSurface"')
    ));
    expect(hostImports.map(toRepoRelative)).toEqual([
      "src/presentation/main-window/MainWindowPresentationSurface.tsx",
    ]);
    const surfaceSource = readFileSync(hostImports[0], "utf8");
    expect(surfaceSource.match(/<ExpandedPresentationSurface\b/g)).toHaveLength(1);
  });

  it("keeps the Compact Mascot SVG host free of Product/lifecycle/effects/desktop/Electron/pointer-authority imports and IPC side channels", () => {
    const hostFile = path.join(
      repoRoot,
      "src/presentation/main-window/CompactMascot.tsx",
    );
    const source = readFileSync(hostFile, "utf8");

    // The FULL leaf rule set (Product dispatch, lifecycle/effects/desktop/
    // center-overlay authority, electron-runtime, Electron package+host)...
    const violations = collectMotionLeafImportViolations(source, hostFile);

    // ...plus the one authority the leaves may consume but the SVG host must
    // never import (it receives the field as a read-only prop): the Pointer
    // Field module.
    for (const match of source.matchAll(IMPORT_PATTERN)) {
      const specifier = (match[1] ?? match[2]).trim();
      if (!specifier) {
        continue;
      }
      const target = resolveSpecifierTarget(hostFile, specifier);
      if (!target) {
        continue;
      }
      if (toRepoRelative(target) === "src/presentation/main-window/pointerField.ts") {
        violations.push(describeViolation(hostFile, specifier, target));
      }
    }
    expect(violations, [
      "CompactMascot must stay a renderer-local visual host: no Product/lifecycle/effects/desktop/Electron or Pointer Field imports; the field arrives as a read-only prop.",
      ...violations,
    ].join("\n")).toEqual([]);

    // The host schedules source-local playback only — no IPC side channels.
    expect(
      MR0_FORBIDDEN_SIDE_CHANNEL_PATTERN.test(source),
      "CompactMascot must not open IPC side channels",
    ).toBe(false);
  });

  it("keeps lifecycle state written only by the react adapter", () => {
    const writers = scanAllProductionFiles()
      .filter((file) => {
        const source = readFileSync(file, "utf8");
        return source.includes("reduceMainWindowPresentation(")
          || source.includes("createMainWindowPresentationState(");
      })
      .map((file) => toRepoRelative(file))
      .sort();
    expect(writers).toEqual([
      "src/presentation/main-window/lifecycle.ts",
      "src/presentation/main-window/reactAdapter.ts",
    ]);
  });

  it("keeps the Pointer Field written only by the presentation surface and free of module-level state", () => {
    const writers = scanAllProductionFiles()
      .filter((file) => {
        const source = readFileSync(file, "utf8");
        return source.includes("updatePointerFieldFromClientPoint(")
          || source.includes("resetPointerFieldToCenter(");
      })
      .map((file) => toRepoRelative(file))
      .sort();
    expect(writers).toEqual([
      "src/presentation/main-window/MainWindowPresentationSurface.tsx",
    ]);

    // Unmount isolation: the field has no module-level mutable store; its
    // MotionValues live and die with the surface instance.
    const pointerFieldSource = readFileSync(
      path.join(repoRoot, "src/presentation/main-window/pointerField.ts"),
      "utf8",
    );
    expect(
      /^let\s/m.test(pointerFieldSource),
      "pointerField.ts must not hold module-level mutable state",
    ).toBe(false);
  });

  it("keeps M3 visual candidates out of authority modules", () => {
    const authorityFiles = [
      "src/presentation/main-window/lifecycle.ts",
      "src/presentation/main-window/projections.ts",
      "src/presentation/main-window/effectContracts.ts",
      "src/presentation/main-window/effectExecutor.ts",
      "src/presentation/main-window/reactAdapter.ts",
      "src/features/download/model.ts",
      "src/features/download/reducer.ts",
      "src/features/download/selectors.ts",
    ];
    const candidateRelatives = [
      "src/presentation/main-window/DownloadIntakeTransitionSurface.tsx",
      "src/presentation/main-window/DownloadProgressSurface.tsx",
      "src/presentation/main-window/downloadIntakeMotionRecipe.ts",
      "src/presentation/main-window/downloadIntakePresentation.ts",
      "src/presentation/main-window/interactionOrigin.ts",
    ];
    for (const relative of authorityFiles) {
      const file = path.join(repoRoot, relative);
      const source = readFileSync(file, "utf8");
      const violations: string[] = [];
      for (const match of source.matchAll(IMPORT_PATTERN)) {
        const specifier = (match[1] ?? match[2]).trim();
        if (!specifier) {
          continue;
        }
        const target = resolveSpecifierTarget(file, specifier);
        if (!target) {
          continue;
        }
        if (candidateRelatives.includes(toRepoRelative(target))) {
          violations.push(describeViolation(file, specifier, target));
        }
      }
      expect(violations, [
        "Authority modules must not import M3 visual candidates.",
        ...violations,
      ].join("\n")).toEqual([]);
    }
  });

  it("flags representative forbidden MR0 motion-leaf imports and side channels", () => {
    const leafFile = path.join(srcRoot, "presentation", "main-window", "fake.ts");
    const flag = (source: string, expectedTarget: string): void => {
      const violations = collectMotionLeafImportViolations(source, leafFile);
      expect(violations, `expected a violation for ${expectedTarget}`).toHaveLength(1);
      expect(violations[0]).toContain(expectedTarget);
    };

    flag(
      'import { reduceMainWindowPresentation } from "./lifecycle.js";',
      "src/presentation/main-window/lifecycle.ts",
    );
    flag(
      'import { selectPrimaryTask } from "../../features/download/selectors.js";',
      "src/features/download/selectors.ts",
    );
    flag(
      'import { desktopCurrentWindow } from "../../desktop/runtime.js";',
      "src/desktop/runtime.ts",
    );
    flag(
      'import { app } from "electron";',
      "forbidden package",
    );
    // The Pointer Field is the designated consumer source, not a forbidden target.
    expect(collectMotionLeafImportViolations(
      'import { resolvePointerFieldCenterPoint } from "./pointerField";',
      leafFile,
    )).toEqual([]);
    // IPC side channels are rejected by the side-channel scan.
    const ipcSource = 'import { motion } from "motion/react";\nipcRenderer.send("x", 1);';
    expect(MR0_FORBIDDEN_SIDE_CHANNEL_PATTERN.test(ipcSource)).toBe(true);
  });
});
