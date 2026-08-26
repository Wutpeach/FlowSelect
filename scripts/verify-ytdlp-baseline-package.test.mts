import { execFile } from "node:child_process";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { afterEach, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const tempRoots: string[] = [];

const runVerifier = (outputRoot: string) => execFileAsync(process.execPath, [
  "scripts/verify-ytdlp-baseline-package.mjs",
  "--win",
  "--output-root",
  outputRoot,
], { cwd: process.cwd() });

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("packaged yt-dlp baseline verifier", () => {
  it("requires the full app-owned manifest contract", async () => {
    const outputRoot = await mkdtemp(join(tmpdir(), "ameow-ytdlp-package-"));
    tempRoots.push(outputRoot);
    const baselineRoot = join(
      outputRoot,
      "win-unpacked",
      "resources",
      "app",
      "desktop-assets",
      "binaries",
      "ytdlp-baseline",
    );
    await cp(join(process.cwd(), "desktop-assets", "binaries", "ytdlp-baseline"), baselineRoot, { recursive: true });
    const manifestPath = join(baselineRoot, ".official-ytdlp-baseline.json");
    const canonicalManifest = await readFile(manifestPath, "utf8");

    await expect(runVerifier(outputRoot)).resolves.toMatchObject({ stdout: expect.stringContaining("Verified packaged yt-dlp baseline") });

    const invalidManifests: Array<[string, (manifest: Record<string, unknown>) => void]> = [
      ["minPython", (manifest) => { delete manifest.minPython; }],
      ["runtimeTargets", (manifest) => { manifest.runtimeTargets = ["x86_64-pc-windows-msvc"]; }],
      ["probe", (manifest) => { manifest.probe = { args: ["--help"], expectedVersion: "2026.07.04" }; }],
    ];
    for (const [, mutate] of invalidManifests) {
      const manifest = JSON.parse(canonicalManifest) as Record<string, unknown>;
      mutate(manifest);
      await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
      await expect(runVerifier(outputRoot)).rejects.toThrow("Packaged yt-dlp baseline manifest diverges from app pins");
    }
  });
});
