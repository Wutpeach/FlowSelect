import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { resolveManagedPythonPackageSpec } from "./managed-python-package-manifest.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const args = process.argv.slice(2);
const outputRootFlag = args.indexOf("--output-root");
const outputRoot = outputRootFlag >= 0 && args[outputRootFlag + 1]
  ? path.resolve(repoRoot, args[outputRootFlag + 1])
  : path.join(repoRoot, "dist-release");
const runtimeTargets = [
  "x86_64-pc-windows-msvc",
  "aarch64-apple-darwin",
  "x86_64-apple-darwin",
];

const sha256 = (filePath) => createHash("sha256").update(readFileSync(filePath)).digest("hex");
const normalizeName = (value) => value.toLowerCase().replace(/[-_.]+/g, "-");

const findMacApp = (directory) => {
  if (!existsSync(directory)) {
    return null;
  }
  const entry = readdirSync(directory, { withFileTypes: true }).find(
    (candidate) => candidate.isDirectory() && candidate.name.endsWith(".app"),
  );
  return entry ? path.join(directory, entry.name) : null;
};

const artifactRoots = () => {
  const wantsWindows = args.includes("--win") || (process.platform === "win32" && !args.includes("--mac"));
  if (wantsWindows) {
    return [path.join(outputRoot, "win-unpacked", "resources", "app")];
  }
  const macDirectories = args.includes("--arm64") ? ["mac-arm64", "mac"] : ["mac", "mac-arm64"];
  return macDirectories
    .map((directory) => findMacApp(path.join(outputRoot, directory)))
    .filter(Boolean)
    .map((app) => path.join(app, "Contents", "Resources", "app"));
};

const verifyArtifact = async (appRoot) => {
  const spec = await resolveManagedPythonPackageSpec("yt-dlp");
  const baselineRoot = path.join(appRoot, "desktop-assets", "binaries", "ytdlp-baseline");
  const manifestPath = path.join(baselineRoot, ".official-ytdlp-baseline.json");
  if (!existsSync(manifestPath)) {
    throw new Error(`Missing packaged yt-dlp baseline manifest: ${manifestPath}`);
  }
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const packages = Array.isArray(manifest.packages) ? manifest.packages : [];
  const expectedPins = spec.installSources.map((source) => {
    const [name, version] = source.split("==");
    return { name: normalizeName(name), version };
  });
  if (
    manifest.schemaVersion !== 1
    || manifest.layoutVersion !== 1
    || manifest.packageSetId !== spec.packageSetId
    || JSON.stringify(manifest.minPython) !== JSON.stringify(spec.minPython)
    || JSON.stringify(manifest.runtimeTargets) !== JSON.stringify(runtimeTargets)
    || JSON.stringify(packages.map((entry) => ({ name: normalizeName(entry.name), version: entry.version })))
      !== JSON.stringify(expectedPins)
    || manifest.executionPolicy?.configIsolation !== true
    || manifest.executionPolicy?.pluginDirs !== "disabled"
    || manifest.executionPolicy?.remoteComponents !== "disabled"
    || manifest.executionPolicy?.jsRuntime !== "managed-deno-absolute-path"
    || JSON.stringify(manifest.probe) !== JSON.stringify({ args: ["--version"], expectedVersion: spec.packageVersion })
  ) {
    throw new Error(`Packaged yt-dlp baseline manifest diverges from app pins: ${manifestPath}`);
  }
  const expectedFiles = new Set([path.basename(manifestPath), ...packages.map((entry) => entry.filename)]);
  const files = readdirSync(baselineRoot);
  if (files.length !== expectedFiles.size || files.some((file) => !expectedFiles.has(file))) {
    throw new Error(`Packaged yt-dlp baseline has an unexpected package set: ${baselineRoot}`);
  }
  for (const entry of packages) {
    const wheelPath = path.join(baselineRoot, entry.filename);
    if (statSync(wheelPath).size !== entry.size || sha256(wheelPath) !== entry.sha256) {
      throw new Error(`Packaged yt-dlp baseline wheel verification failed: ${wheelPath}`);
    }
  }
  return baselineRoot;
};

const roots = artifactRoots();
if (roots.length === 0 || roots.some((root) => !existsSync(root))) {
  throw new Error(`No packaged application root found for yt-dlp baseline verification: ${roots.join(", ")}`);
}
for (const root of roots) {
  console.log(`Verified packaged yt-dlp baseline: ${await verifyArtifact(root)}`);
}
