import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { resolveManagedPythonPackageSpec } from "./managed-python-package-manifest.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const baselineRoot = path.join(repoRoot, "desktop-assets", "binaries", "ytdlp-baseline");
const manifestPath = path.join(baselineRoot, ".official-ytdlp-baseline.json");
const verifyOnly = process.argv.slice(2).includes("--verify");
const runtimeTargets = [
  "x86_64-pc-windows-msvc",
  "aarch64-apple-darwin",
  "x86_64-apple-darwin",
];

const normalizePackageName = (value) => value.toLowerCase().replace(/[-_.]+/g, "-");
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

const parsePin = (value) => {
  const match = /^(.+)==(.+)$/.exec(value);
  if (!match) {
    throw new Error(`Invalid managed Python package pin: ${value}`);
  }
  return { name: normalizePackageName(match[1]), version: match[2] };
};

const readManifest = async () => JSON.parse(await readFile(manifestPath, "utf8"));

const expectedPins = async () => {
  const spec = await resolveManagedPythonPackageSpec("yt-dlp");
  return {
    spec,
    pins: spec.installSources.map(parsePin),
  };
};

const verify = async () => {
  const { spec, pins } = await expectedPins();
  const manifest = await readManifest();
  const actual = Array.isArray(manifest.packages) ? manifest.packages : [];
  if (
    manifest.schemaVersion !== 1
    || manifest.layoutVersion !== 1
    || manifest.packageSetId !== spec.packageSetId
    || JSON.stringify(manifest.minPython) !== JSON.stringify(spec.minPython)
    || JSON.stringify(manifest.runtimeTargets) !== JSON.stringify(runtimeTargets)
    || JSON.stringify(actual.map((entry) => ({
      name: normalizePackageName(entry.name),
      version: entry.version,
    }))) !== JSON.stringify(pins)
    || manifest.executionPolicy?.configIsolation !== true
    || manifest.executionPolicy?.pluginDirs !== "disabled"
    || manifest.executionPolicy?.remoteComponents !== "disabled"
    || manifest.executionPolicy?.jsRuntime !== "managed-deno-absolute-path"
    || JSON.stringify(manifest.probe) !== JSON.stringify({ args: ["--version"], expectedVersion: spec.packageVersion })
  ) {
    throw new Error("Bundled yt-dlp baseline manifest does not match managedPythonPackageManifest");
  }
  const expectedFiles = new Set([".official-ytdlp-baseline.json", ...actual.map((entry) => entry.filename)]);
  const actualFiles = await (await import("node:fs/promises")).readdir(baselineRoot);
  if (actualFiles.some((entry) => !expectedFiles.has(entry)) || expectedFiles.size !== actualFiles.length) {
    throw new Error("Bundled yt-dlp baseline has an unexpected package set");
  }
  for (const entry of actual) {
    const filePath = path.join(baselineRoot, entry.filename);
    const [bytes, fileStats] = await Promise.all([readFile(filePath), stat(filePath)]);
    if (fileStats.size !== entry.size || sha256(bytes) !== entry.sha256) {
      throw new Error(`Bundled yt-dlp baseline wheel verification failed: ${entry.filename}`);
    }
  }
  return manifest;
};

const prepare = async () => {
  const { spec, pins } = await expectedPins();
  const packages = [];
  await mkdir(baselineRoot, { recursive: true });
  for (const pin of pins) {
    const provenanceUrl = `https://pypi.org/pypi/${encodeURIComponent(pin.name)}/${encodeURIComponent(pin.version)}/json`;
    const metadataResponse = await fetch(provenanceUrl, { redirect: "error" });
    if (!metadataResponse.ok) {
      throw new Error(`Failed to read approved wheel metadata: ${provenanceUrl}`);
    }
    const metadata = await metadataResponse.json();
    const wheel = metadata.urls?.find((entry) => (
      entry.packagetype === "bdist_wheel"
      && typeof entry.filename === "string"
      && entry.filename.endsWith("py3-none-any.whl")
    ));
    if (!wheel || typeof wheel.url !== "string" || new URL(wheel.url).hostname !== "files.pythonhosted.org") {
      throw new Error(`No approved universal wheel found for ${pin.name}==${pin.version}`);
    }
    const expectedSha256 = wheel.digests?.sha256;
    if (typeof expectedSha256 !== "string" || typeof wheel.size !== "number") {
      throw new Error(`Wheel metadata is incomplete for ${pin.name}==${pin.version}`);
    }
    const wheelResponse = await fetch(wheel.url, { redirect: "error" });
    if (!wheelResponse.ok) {
      throw new Error(`Failed to download approved wheel: ${wheel.filename}`);
    }
    const bytes = Buffer.from(await wheelResponse.arrayBuffer());
    if (bytes.length !== wheel.size || sha256(bytes) !== expectedSha256) {
      throw new Error(`Downloaded wheel verification failed: ${wheel.filename}`);
    }
    const filename = wheel.filename;
    await writeFile(path.join(baselineRoot, filename), bytes);
    packages.push({
      name: pin.name,
      version: pin.version,
      filename,
      size: wheel.size,
      sha256: expectedSha256,
      provenanceUrl,
    });
  }
  await writeFile(manifestPath, `${JSON.stringify({
    schemaVersion: 1,
    layoutVersion: 1,
    packageSetId: spec.packageSetId,
    packages,
    minPython: spec.minPython,
    runtimeTargets,
    executionPolicy: {
      configIsolation: true,
      pluginDirs: "disabled",
      remoteComponents: "disabled",
      jsRuntime: "managed-deno-absolute-path",
    },
    probe: { args: ["--version"], expectedVersion: spec.packageVersion },
  }, null, 2)}\n`, "utf8");
  await verify();
};

if (!existsSync(manifestPath) && verifyOnly) {
  throw new Error("Bundled yt-dlp baseline has not been prepared");
}
if (verifyOnly) {
  console.log(JSON.stringify(await verify(), null, 2));
} else {
  await rm(baselineRoot, { recursive: true, force: true });
  await prepare();
  console.log(`Prepared verified bundled yt-dlp baseline: ${baselineRoot}`);
}
