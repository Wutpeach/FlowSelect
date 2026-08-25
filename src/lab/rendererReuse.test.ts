import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const here = import.meta.dirname;

const read = (relativePath: string): string =>
  readFileSync(resolve(here, relativePath), "utf8").replace(/\r\n/g, "\n");

const labHtml = read("../../lab.html");
const indexHtml = read("../../index.html");
const packageJson = read("../../package.json");
const mainEntry = read("../../src/main.tsx");
const labMain = read("./lab-main.tsx");
const labComponent = read("./PresentationLab.tsx");
const labStage = read("./LabOverlayStage.tsx");
const labScenarios = read("./scenarios.ts");
const labFixtures = read("./stateFixtures.ts");
const labProjection = read("./overlayProjection.ts");
const labExport = read("./exportPng.ts");
const labCompactStage = read("./CompactPreviewStage.tsx");
const labPreviewTargets = read("./previewTargets.ts");
const labCompactPointer = read("./compactPointerField.ts");
const labControls = read("./labControls.ts");
const labEnvironment = read("./previewEnvironment.ts");
const labSegmented = read("./LabSegmentedControl.tsx");
const labEnvPicker = read("./PreviewEnvironmentPicker.tsx");
const labOneWorksInspector = read("./OneWorksMascotInspector.tsx");
const labOneWorksFixture = read("./oneworksMascot.ts");
const labOneWorksCandidate = read("./oneworksAmeowCandidate.ts");
const labCss = read("./lab.css");
const viteConfig = read("../../vite.config.ts");
const labViteConfig = read("../../vite.lab.config.ts");

const labSources = [
  labMain,
  labComponent,
  labStage,
  labScenarios,
  labFixtures,
  labProjection,
  labExport,
  labCompactStage,
  labPreviewTargets,
  labCompactPointer,
  labControls,
  labEnvironment,
  labSegmented,
  labEnvPicker,
  labOneWorksInspector,
  labOneWorksFixture,
  labOneWorksCandidate,
];

const importSpecifiers = (source: string): string[] => {
  const specifiers: string[] = [];
  const pattern = /(?:^|\n)\s*(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source)) !== null) {
    specifiers.push(match[1]);
  }
  return specifiers;
};

describe("Browser Presentation Lab build isolation", () => {
  it("mounts the exact Agentation dev tool from the Lab entry only", () => {
    expect(packageJson).toContain('"agentation": "3.0.2"');
    expect(labMain).toContain('from "agentation"');
    expect(labMain.match(/<Agentation\s+className="lab-agentation-toolbar"\s*\/>/g)).toHaveLength(1);
    expect(labMain).not.toContain("onAnnotationAdd=");
    expect(mainEntry).not.toContain("agentation");
    expect(viteConfig).not.toContain("agentation");
  });

  it("is a dedicated dev-only browser entry never referenced by production", () => {
    expect(labHtml).toContain("/src/lab/lab-main.tsx");
    expect(indexHtml).not.toContain("lab.html");
    expect(indexHtml).not.toContain("src/lab");
    expect(mainEntry).not.toContain("src/lab");
    expect(mainEntry).not.toContain("PresentationLab");
  });

  it("pins the production build input to index.html only (Lab excluded)", () => {
    expect(viteConfig).toContain("build");
    // Scope the assertion to the actual build config block, not comments.
    const buildSection = viteConfig.slice(
      viteConfig.indexOf("build: {"),
      viteConfig.indexOf("test: {"),
    );
    expect(buildSection).toContain("rollupOptions");
    expect(buildSection).toContain("index.html");
    // The production renderer build must never include or depend on the Lab.
    expect(buildSection).not.toContain("lab.html");
    expect(buildSection).not.toContain("src/lab");
  });

  it("provides a dedicated lab Vite server on its own address", () => {
    expect(labViteConfig).toContain("1421");
    expect(labViteConfig).toContain("lab.html");
    expect(labViteConfig).toContain("rollupOptions");
    expect(labViteConfig).toContain('new URL("./lab.html", import.meta.url)');
    expect(labViteConfig).not.toContain('new URL("./index.html", import.meta.url)');
  });

  it("initializes zh-CN first with no desktop bridge in the lab entry", () => {
    expect(labMain).toContain("initializeLabI18n");
    expect(labMain).toContain('"zh-CN"');
    expect(labMain).not.toContain("I18nRuntimeBridge");
    expect(labMain).not.toContain("desktop/runtime");
    expect(labMain).not.toContain("desktop/config");
  });

  it("keeps the direct OneWorks renderer, editor, and stylesheet behind the Lab graph", () => {
    expect(packageJson).toContain('"@oneworks/avatar": "1.0.0-rc.6"');
    expect(packageJson).toContain('"@oneworks/avatar-react": "1.0.0-rc.6"');
    const dependencies = packageJson.slice(
      packageJson.indexOf('"dependencies"'),
      packageJson.indexOf('"devDependencies"'),
    );
    expect(dependencies).not.toContain("@oneworks/avatar");
    expect(labComponent).toContain('from "./OneWorksMascotInspector"');
    expect(labOneWorksInspector).toContain('from "@oneworks/avatar-react"');
    expect(labOneWorksInspector).toContain('import "@oneworks/avatar-react/style.css"');
    expect(labMain).not.toContain("@oneworks/avatar");
    expect(labComponent).not.toContain("@oneworks/avatar");
    expect(mainEntry).not.toContain("@oneworks/avatar");
    expect(indexHtml).not.toContain("@oneworks/avatar");
    expect(mainEntry).not.toContain("oneworksAmeowCandidate");
    expect(indexHtml).not.toContain("oneworksAmeowCandidate");
  });
});

describe("Browser Presentation Lab production renderer reuse", () => {
  it("mounts the one production ExpandedPresentationSurface with the production palette", () => {
    expect(labStage.match(/<ExpandedPresentationSurface\b/g)).toHaveLength(1);
    expect(labStage).toContain("palette={THERMAL_PALETTE}");
    expect(labStage).toContain('eligible');
    // The derived Refraction mode is forwarded through the one production
    // surface as a lab-only flag; the Lab never re-implements the shader.
    expect(labStage).toContain("refraction={refractionMode}");
    expect(labStage).toContain("boundaryHalo={boundaryHaloMode}");
  });

  it("keeps the 228/200/14 Lab layer split interaction-safe with one shadow owner", () => {
    expect(labStage).toContain("MAIN_WINDOW_PANEL_SIZE + MAIN_WINDOW_FULL_SHADOW_GUTTER * 2");
    expect(labStage).toContain('data-lab-panel-shell=""');
    expect(labStage).toContain('data-lab-panel-clip=""');
    expect(labStage).toContain('pointerEvents: "auto"');
    expect(labStage).toContain('background: "none"');
    expect(labStage).toContain('boxShadow: "none"');
    expect(labStage.match(/boxShadow: colors\.panelShadow/g)).toHaveLength(1);
    expect(labStage).toContain("onClick={boundaryHaloMode ? undefined : handlePreviewClick}");
    expect(labStage).toContain("onClick={handlePreviewClick}");
  });

  it("reimplements no renderer, runtime, or shader", () => {
    for (const source of labSources) {
      expect(source).not.toContain("createExpandedPresentationRuntime(");
      expect(source).not.toContain("#version");
      expect(source).not.toContain("FRAGMENT_SHADER_SOURCE");
      expect(source).not.toContain("VERTEX_SHADER_SOURCE");
      expect(source).not.toContain("gl.drawArrays");
      expect(source).not.toContain("<canvas");
      expect(source).not.toContain("canvas.width =");
      expect(source).not.toContain("createShader");
    }
  });

  it("only introspects the existing production context for readout", () => {
    // The inspector reads uniforms from the ONE existing canvas/context (the
    // same technique as the MR9 CDP harness) and never creates or configures
    // a renderer of its own.
    expect(labComponent).toContain('document.querySelectorAll("canvas")');
    expect(labComponent).toContain('canvas.getContext("webgl2")');
    expect(labComponent).toContain('gl.getParameter(gl.CURRENT_PROGRAM)');
  });

  it("consumes only browser-safe and production-presentation imports", () => {
    const forbidden = [
      /desktop\/runtime/,
      /desktop\/config/,
      /electron-runtime/,
      /electron\//,
      /browser-extension/,
      /App\.tsx/,
      /features\/download\/client/,
      /main\.tsx/,
    ];
    for (const source of labSources) {
      for (const specifier of importSpecifiers(source)) {
        for (const pattern of forbidden) {
          expect(specifier).not.toMatch(pattern);
        }
      }
    }
  });

  it("lab entry wires lab-main -> PresentationLab -> LabOverlayStage -> production host", () => {
    expect(labMain).toContain("PresentationLab");
    expect(labComponent).toContain('from "./LabOverlayStage"');
    expect(labStage).toContain('from "../presentation/main-window/ExpandedPresentationSurface"');
    expect(labScenarios).toContain('from "../presentation/main-window/expandedPresentationTargets"');
  });

  it("migrates legacy scenarios through production pure paths only", () => {
    // The seven legacy scenes are static fixtures projected through the same
    // selectors/helpers/projections the Electron main window uses — never a
    // synthetic command bus or override mechanism.
    expect(labFixtures).toContain('from "../features/download/model"');
    expect(labFixtures).toContain('from "../protocol/download/ipcTypes"');
    expect(labFixtures).toContain('from "../types/runtimeDependencies"');
    expect(labProjection).toContain('from "../features/download/selectors"');
    expect(labProjection).toContain('from "../presentation/main-window/downloadProgressProjection"');
    expect(labProjection).toContain('from "../utils/runtimeDependencyGate"');
    expect(labFixtures).not.toContain("dev_ui_lab_apply_scenario");
    expect(labProjection).not.toContain("dev_ui_lab_apply_scenario");
    expect(labFixtures).not.toContain("ipcRenderer");
    expect(labProjection).not.toContain("ipcRenderer");
  });

  it("reuses the current production Compact renderer leaf for the Compact target", () => {
    // The Compact target is a Lab-local UI discriminant wired to the EXISTING
    // production CompactMascot + production geometry constants. No second
    // renderer, canvas, native window, or production authority.
    expect(labCompactStage).toContain('from "../presentation/main-window/CompactMascot"');
    expect(labCompactStage).not.toContain("MainWindowPresentationSurface");
    expect(labCompactStage).not.toContain("ExpandedPresentationSurface");
    expect(labCompactStage).toContain('from "../presentation/main-window/compactMascotRecipe"');
    expect(labCompactStage).toContain('from "../constants/windowMetrics"');
    expect(labCompactStage).toContain('from "../presentation/main-window/geometry"');
    expect(labCompactStage).toContain('from "./compactPointerField"');
    expect(labCompactStage).not.toContain('from "../presentation/main-window/pointerField"');
    expect(labCompactStage).not.toContain("updatePointerFieldFromClientPoint(");
    expect(labCompactStage).not.toContain("resetPointerFieldToCenter(");
    // The Lab workspace wires BOTH targets to the one preview host decision.
    expect(labComponent).toContain('from "./CompactPreviewStage"');
    expect(labComponent).toContain('from "./previewTargets"');
    expect(labComponent).toContain("<CompactPreviewStage");
    expect(labComponent).toContain("<LabOverlayStage");
    // Lab-local pointer + target models derive geometry from production only.
    expect(labPreviewTargets).toContain('from "../constants/windowMetrics"');
    expect(labPreviewTargets).toContain('from "../presentation/main-window/compactMascotRecipe"');
    expect(labPreviewTargets).toContain('from "../presentation/main-window/geometry"');
    expect(labCompactPointer).not.toContain("MainWindowPresentationSurface");
    // Exactly ONE production Expanded surface remains across the whole Lab.
    expect(labStage.match(/<ExpandedPresentationSurface\b/g)).toHaveLength(1);
  });

  it("adds the OneWorks inspector as a Lab mode without introducing a second production renderer path", () => {
    expect(labComponent).toContain('data-lab-oneworks-inspector-open=""');
    expect(labOneWorksInspector).toContain("<AvatarEditor");
    expect(labOneWorksInspector).toContain('data-oneworks-avatar-60=""');
    expect(labOneWorksInspector).toContain('data-oneworks-avatar-magnified=""');
    expect(labOneWorksFixture).toContain("createDefaultAvatarDefinition");
    expect(labOneWorksFixture).not.toContain("buildAvatarBodyGeometry");
    expect(labOneWorksCandidate).toContain("resolveCompactMascotAttention");
    expect(labOneWorksCandidate).not.toContain('from "../presentation/main-window/pointerField"');
    expect(labOneWorksInspector).not.toContain("MainWindowPresentationSurface");
    expect(labOneWorksInspector).not.toContain('from "../presentation/main-window/pointerField"');
  });

  it("repairs the page into two macro regions with no page heading", () => {
    // No left Scenario Navigation region and no page title / subtitle.
    expect(labComponent).not.toContain("<nav");
    expect(labComponent).not.toContain("appTitle");
    expect(labComponent).not.toContain("appSubtitle");
    // Two regions: Main Workspace + persistent Dev Tools.
    expect(labComponent).toContain("data-lab-workspace");
    expect(labComponent).toContain("data-lab-devtools");
    // The flat scenario strip is the FIRST Main Workspace content.
    expect(labComponent).toContain("data-lab-scenario-strip");
  });

  it("keeps Dev Tools always visible (no narrow-window hide rule)", () => {
    expect(labCss).not.toContain("display: none");
    expect(labCss).not.toContain("1080px");
    // Dev Tools uses a clamped width instead.
    expect(labComponent).toContain("clamp(");
  });

  it("keeps the preview environment a screen-only chrome layer outside export", () => {
    expect(labComponent).toContain("data-lab-env=");
    // The environment is a sibling chrome layer behind the preview host, not
    // the frame's own background, so the Full PNG export (which reads only the
    // frame element) never captures it and no renderer/theme state sees it.
    expect(labEnvironment).not.toContain("ExpandedPresentationSurface");
    expect(labEnvironment).not.toContain("CompactMascot");
    expect(labEnvironment).not.toContain("<canvas");
    expect(labEnvPicker).not.toContain("ExpandedPresentationSurface");
    expect(labEnvPicker).not.toContain("CompactMascot");
    // The environment layer is explicitly non-interactive chrome.
    expect(labComponent).toContain("pointerEvents: \"none\"");
  });

  it("stacks the below-preview controls into labeled groups (not one toolbar)", () => {
    expect(labComponent).toContain("data-lab-control-groups");
    expect(labComponent).toContain('data-lab-control-group="target"');
    expect(labComponent).toContain('data-lab-control-group="scale"');
    expect(labComponent).toContain('data-lab-control-group="actions"');
    expect(labComponent).toContain('t("controls.displayMode")');
    expect(labComponent).toContain('t("controls.zoom")');
    expect(labComponent).toContain('t("controls.actions")');
  });

  it("curates the scenario strip to a small representative set", () => {
    expect(labComponent).toContain("data-lab-scenario-strip");
    // Curated representative scenarios only (repository authority unchanged).
    expect(labComponent).toContain('selectScenario("intake")');
    expect(labComponent).toContain('selectScenario("heatmap")');
    expect(labComponent).toContain('selectScenario("mixed")');
    expect(labComponent).toContain('"data-lab-preset": "download-active"');
    // The dense per-dimension cloud is gone from the visible set.
    expect(labComponent).not.toContain("selectProgressAction");
    expect(labComponent).not.toContain("selectActivationPreset");
    expect(labComponent).not.toContain("selectHeatmapPreset");
    expect(labComponent).not.toContain("presets.indeterminate");
    expect(labComponent).not.toContain("presets.progress50");
  });

  it("uses Lab-local segmented controls for target and scale", () => {
    expect(labComponent).toContain("<LabSegmentedControl<LabPreviewTarget>");
    expect(labComponent).toContain("<LabSegmentedControl<string>");
    expect(labSegmented).toContain('role="group"');
    expect(labSegmented).toContain("aria-pressed={selected}");
    // The segmented control and the picker stay inside the Lab entry graph.
    expect(labComponent).toContain('from "./LabSegmentedControl"');
    expect(labComponent).toContain('from "./PreviewEnvironmentPicker"');
  });

  it("marks the unified Workspace Shell into Header / Body / Footer regions", () => {
    expect(labComponent).toContain("data-lab-workspace-header");
    expect(labComponent).toContain("data-lab-workspace-body");
    expect(labComponent).toContain("data-lab-workspace-footer");
    // The scenario strip is the Header region and stays the FIRST Workspace
    // content (same element carries both markers).
    expect(labComponent).toContain('data-lab-workspace-header=""\n          data-lab-scenario-strip=""');
    // The Body region is the preview stage viewport.
    expect(labComponent).toContain('data-lab-workspace-body=""\n          data-lab-stage-viewport=""');
    // The Footer wraps the grouped controls + caption, not a per-group card.
    const footerIndex = labComponent.indexOf('data-lab-workspace-footer=""');
    expect(labComponent.indexOf('data-lab-control-groups=""', footerIndex))
      .toBeGreaterThan(footerIndex);
  });

  it("renames the adaptive scale to discrete Auto (1/2/3, never below 1 or above 3)", () => {
    expect(labPreviewTargets).toContain('["auto", 1, 2, 3]');
    expect(labPreviewTargets).toContain('LAB_DISPLAY_SCALE_DEFAULT: LabDisplayScale = "auto"');
    expect(labPreviewTargets).toContain("resolveLabAutoDisplayScale");
    expect(labPreviewTargets).not.toContain("resolveLabPreviewDisplayScale");
    expect(labPreviewTargets).not.toContain("fit");
    expect(labComponent).toContain('t("workspace.auto", { scale: autoScale })');
    expect(labComponent).toContain('t("workspace.autoLabel")');
    expect(labComponent).not.toContain("workspace.fit");
    // Auto metadata is integer, never a continuous decimal.
    expect(labComponent).not.toContain("toFixed(");
  });

  it("keeps the origin marker Lab-local and conditional", () => {
    expect(labStage).toContain("originMarkerVisible");
    expect(labStage).toContain("{originMarkerVisible ? (");
    expect(labComponent).toContain("originMarkerVisible={originMarkerVisible}");
    // Visible for the origin-relevant Intake scenario or while editing origin.
    expect(labComponent).toContain('activeScenarioId === "intake"');
  });

  it("ignores prevented Full clicks before updating the Lab-local origin", () => {
    const guardIndex = labStage.indexOf("event.defaultPrevented");
    const updateIndex = labStage.indexOf("onPreviewClick({");
    expect(guardIndex).toBeGreaterThan(-1);
    expect(updateIndex).toBeGreaterThan(guardIndex);
  });

  it("groups Background and Reset in the Preview lower-left without changing Reset semantics", () => {
    expect(labComponent).toContain('data-lab-preview-controls=""');
    expect(labComponent).toContain('data-lab-reset=""');
    expect(labComponent).toContain("title={t(\"workspace.resetHint\")}");
    expect(labComponent).toContain("aria-label={t(\"workspace.reset\")}");
    expect(labComponent).toContain("handleReset");
  });

  it("treats Replay and Export as secondary (no persistent orange hierarchy)", () => {
    expect(labComponent).toContain('data-lab-export=""');
    expect(labComponent).not.toContain("EXPORT_BUTTON_STYLE");
    expect(labComponent).not.toContain("#b56a4a");
  });
});
