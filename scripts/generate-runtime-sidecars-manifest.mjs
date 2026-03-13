import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      continue;
    }
    const key = token.slice(2);
    const next = argv[index + 1];
    if (next === undefined || next.startsWith("--")) {
      parsed[key] = "true";
      continue;
    }
    parsed[key] = next;
    index += 1;
  }
  return parsed;
}

function walkFiles(rootDir) {
  const entries = readdirSync(rootDir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = join(rootDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkFiles(fullPath));
      continue;
    }
    if (entry.isFile()) {
      files.push(fullPath);
    }
  }
  return files;
}

function sha256Hex(filePath) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

function readLock(lockPath) {
  const lock = JSON.parse(readFileSync(lockPath, "utf8"));
  const flowselectSidecarVersion = String(lock?.flowselectSidecarVersion ?? "").trim();
  const upstreamVersion = String(lock?.upstream?.version ?? "").trim();
  if (!flowselectSidecarVersion) {
    throw new Error("lock.json is missing flowselectSidecarVersion");
  }
  if (!upstreamVersion) {
    throw new Error("lock.json is missing upstream.version");
  }
  return { flowselectSidecarVersion, upstreamVersion };
}

function parseMetadata(path) {
  const metadata = JSON.parse(readFileSync(path, "utf8"));
  const requiredFields = [
    "component",
    "target",
    "assetName",
    "flowselectSidecarVersion",
    "upstreamVersion",
    "sha256",
    "size",
  ];
  for (const field of requiredFields) {
    if (!(field in metadata)) {
      throw new Error(`Metadata ${path} is missing required field: ${field}`);
    }
  }
  return metadata;
}

function isLikelySemver(value) {
  return /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(value);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const assetsDirArg = String(args["assets-dir"] ?? "").trim();
  const repo = String(args.repo ?? "").trim();
  const releaseTag = String(args["release-tag"] ?? "").trim();
  const publishedAt = String(args["published-at"] ?? "").trim();
  const outputArg = String(args.output ?? "").trim();
  const component = String(args.component ?? "pinterest-dl").trim();
  const lockArg = String(args.lock ?? "").trim();
  const minAppVersionRaw = String(args["min-app-version"] ?? "").trim();
  const minAppVersion = minAppVersionRaw || undefined;
  const lockPath = lockArg
    ? resolve(repoRoot, lockArg)
    : join(repoRoot, "src-tauri", "pinterest-sidecar", "lock.json");

  if (!assetsDirArg) {
    throw new Error("Missing required --assets-dir");
  }
  if (!repo) {
    throw new Error("Missing required --repo");
  }
  if (!releaseTag) {
    throw new Error("Missing required --release-tag");
  }
  if (!publishedAt) {
    throw new Error("Missing required --published-at");
  }
  if (!outputArg) {
    throw new Error("Missing required --output");
  }
  if (!component) {
    throw new Error("component must not be empty");
  }
  if (minAppVersion && !isLikelySemver(minAppVersion)) {
    throw new Error(
      `Invalid --min-app-version value "${minAppVersion}". Expected a semver string like 0.2.6`,
    );
  }

  const assetsDir = resolve(repoRoot, assetsDirArg);
  const outputPath = resolve(repoRoot, outputArg);
  const { flowselectSidecarVersion, upstreamVersion } = readLock(lockPath);
  const allFiles = walkFiles(assetsDir);
  const metadataPaths = allFiles.filter((path) => path.endsWith(".metadata.json"));
  if (metadataPaths.length === 0) {
    throw new Error(`No metadata files found in assets dir: ${assetsDir}`);
  }

  const byAssetName = new Map();
  for (const path of allFiles) {
    if (path.endsWith(".metadata.json")) {
      continue;
    }
    const name = path.replace(/^.*[\\/]/, "");
    if (byAssetName.has(name)) {
      throw new Error(`Duplicate asset file name detected: ${name}`);
    }
    byAssetName.set(name, path);
  }

  const artifacts = metadataPaths
    .map((metadataPath) => {
      const metadata = parseMetadata(metadataPath);
      if (String(metadata.component).trim() !== component) {
        throw new Error(
          `Metadata component mismatch for ${metadataPath}: ${metadata.component} != ${component}`,
        );
      }
      if (String(metadata.flowselectSidecarVersion) !== flowselectSidecarVersion) {
        throw new Error(
          `Metadata flowselectSidecarVersion mismatch for ${metadataPath}: ${metadata.flowselectSidecarVersion} != ${flowselectSidecarVersion}`,
        );
      }
      if (String(metadata.upstreamVersion) !== upstreamVersion) {
        throw new Error(
          `Metadata upstreamVersion mismatch for ${metadataPath}: ${metadata.upstreamVersion} != ${upstreamVersion}`,
        );
      }

      const assetName = String(metadata.assetName);
      const assetPath = byAssetName.get(assetName);
      if (!assetPath) {
        throw new Error(`Asset file not found for metadata ${metadataPath}: ${assetName}`);
      }

      const fileStat = statSync(assetPath);
      if (!fileStat.isFile()) {
        throw new Error(`Asset path is not a regular file: ${assetPath}`);
      }

      const actualSha256 = sha256Hex(assetPath);
      const actualSize = fileStat.size;
      if (actualSha256 !== String(metadata.sha256).toLowerCase()) {
        throw new Error(`Checksum mismatch for ${assetName}: ${actualSha256} != ${metadata.sha256}`);
      }
      if (actualSize !== Number(metadata.size)) {
        throw new Error(`Size mismatch for ${assetName}: ${actualSize} != ${metadata.size}`);
      }

      const entry = {
        component,
        flowselectSidecarVersion,
        upstreamVersion,
        target: String(metadata.target),
        url: `https://github.com/${repo}/releases/download/${releaseTag}/${assetName}`,
        sha256: actualSha256,
        size: actualSize,
        publishedAt,
      };
      if (minAppVersion) {
        entry.minAppVersion = minAppVersion;
      }
      return entry;
    })
    .sort((left, right) => left.target.localeCompare(right.target));

  const manifest = {
    component,
    flowselectSidecarVersion,
    upstreamVersion,
    generatedAt: new Date().toISOString(),
    artifacts,
  };

  writeFileSync(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  console.log(`>>> [Node] Wrote runtime sidecars manifest: ${outputPath}`);
  console.log(JSON.stringify({ artifactCount: artifacts.length, releaseTag }, null, 2));
}

main();
