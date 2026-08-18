import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const here = import.meta.dirname;

const read = (relativePath: string): string =>
  readFileSync(resolve(here, relativePath), "utf8");

const labHtml = read("../../lab.html");
const indexHtml = read("../../index.html");
const mainEntry = read("../../src/main.tsx");
const labMain = read("./lab-main.tsx");
const labComponent = read("./PresentationLab.tsx");
const labStage = read("./LabOverlayStage.tsx");
const labScenarios = read("./scenarios.ts");
const labFixtures = read("./stateFixtures.ts");
const labProjection = read("./overlayProjection.ts");
const labExport = read("./exportPng.ts");
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
  });

  it("initializes zh-CN first with no desktop bridge in the lab entry", () => {
    expect(labMain).toContain("initializeLabI18n");
    expect(labMain).toContain('"zh-CN"');
    expect(labMain).not.toContain("I18nRuntimeBridge");
    expect(labMain).not.toContain("desktop/runtime");
    expect(labMain).not.toContain("desktop/config");
  });
});

describe("Browser Presentation Lab production renderer reuse", () => {
  it("mounts the one production ExpandedPresentationSurface with the production palette", () => {
    expect(labStage.match(/<ExpandedPresentationSurface\b/g)).toHaveLength(1);
    expect(labStage).toContain("palette={THERMAL_PALETTE}");
    expect(labStage).toContain('eligible');
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
});
