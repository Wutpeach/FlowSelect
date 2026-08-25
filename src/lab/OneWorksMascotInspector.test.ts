import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const here = import.meta.dirname;
const read = (relativePath: string): string =>
  readFileSync(resolve(here, relativePath), "utf8").replace(/\r\n/g, "\n");

const inspector = read("./OneWorksMascotInspector.tsx");
const fixture = read("./oneworksMascot.ts");
const candidate = read("./oneworksAmeowCandidate.ts");
const packageJson = JSON.parse(read("../../package.json")) as {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};
const mainEntry = read("../../src/main.tsx");
const indexHtml = read("../../index.html");
const productionViteConfig = read("../../vite.config.ts");

describe("OneWorks Mascot Inspector isolation", () => {
  it("uses exact upstream packages as development-only Lab tooling", () => {
    expect(packageJson.devDependencies?.["@oneworks/avatar"]).toBe("1.0.0-rc.6");
    expect(packageJson.devDependencies?.["@oneworks/avatar-react"]).toBe("1.0.0-rc.6");
    expect(packageJson.dependencies?.["@oneworks/avatar"]).toBeUndefined();
    expect(packageJson.dependencies?.["@oneworks/avatar-react"]).toBeUndefined();
    expect(inspector).toContain('from "@oneworks/avatar-react"');
    expect(inspector).toContain('import "@oneworks/avatar-react/style.css"');
  });

  it("feeds the same controlled candidate through product, mechanism, sweep, and upstream editor views", () => {
    expect(inspector.match(/definition=\{productDefinition\}/g)).toHaveLength(2);
    expect(inspector.match(/definition=\{mechanismDefinition\}/g)).toHaveLength(2);
    expect(inspector).toContain("onDefinitionChange={handleDefinitionChange}");
    expect(inspector).toContain("<AvatarEditor");
    expect(inspector).toContain('data-oneworks-avatar-60=""');
    expect(inspector).toContain('data-oneworks-avatar-magnified=""');
    expect(inspector).toContain('data-oneworks-candidate-avatar-60=""');
    expect(inspector).toContain('data-oneworks-candidate-avatar-magnified=""');
    expect(inspector).toContain("createOneWorksAmeowCandidateDefinition");
  });

  it("keeps production-recipe input, Reduced Motion, export, and lifecycle control inside the Lab host", () => {
    expect(inspector).toContain("resolveOneWorksAmeowAttentionPreview");
    expect(inspector).not.toContain('from "../presentation/main-window/pointerField"');
    expect(inspector).toContain("candidateAvatarRef.current?.stop({ reset });");
    expect(inspector).toContain("mechanismAvatarRef.current?.stop({ reset });");
    expect(inspector).toContain('document.addEventListener("visibilitychange", handleVisibilityChange)');
    expect(inspector).toContain('document.removeEventListener("visibilitychange", handleVisibilityChange)');
    expect(inspector).toContain('"upstream region mounted"');
    expect(inspector).toContain("Export current candidate JSON");
    expect(inspector).toContain("Reload canonical candidate");
    expect(inspector).not.toContain("localStorage");
    expect(inspector).not.toContain("Lab-owned loops");
    expect(inspector).not.toContain("active regions");
  });

  it("keeps all production entry and build paths free of OneWorks and Lab tooling", () => {
    for (const source of [mainEntry, indexHtml, productionViteConfig]) {
      expect(source).not.toContain("@oneworks/avatar");
      expect(source).not.toContain("AvatarEditor");
      expect(source).not.toContain("OneWorksMascotInspector");
      expect(source).not.toContain("oneworksAmeowCandidate");
    }
  });

  it("retains the source-pinned cat fixture rather than reimplementing renderer geometry", () => {
    expect(fixture).toContain('createDefaultAvatarDefinition');
    expect(fixture).toContain('id: "cat-ear-left"');
    expect(fixture).toContain('shape: "cone"');
    expect(fixture).not.toContain("buildAvatarBodyGeometry");
    expect(fixture).not.toContain("<path");
    expect(candidate).toContain('from "../presentation/main-window/compactMascotRecipe"');
    expect(candidate).not.toContain('from "../presentation/main-window/pointerField"');
    expect(candidate).not.toContain("buildAvatarBodyGeometry");
    expect(candidate).not.toContain("<path");
  });
});
