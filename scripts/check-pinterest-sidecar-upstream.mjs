import { appendFileSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const lockPath = join(repoRoot, "desktop-assets", "pinterest-sidecar", "lock.json");
const versionCollator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: "base",
});

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) {
      continue;
    }
    const key = arg.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      parsed[key] = "true";
      continue;
    }
    parsed[key] = next;
    index += 1;
  }
  return parsed;
}

function readLock() {
  return JSON.parse(readFileSync(lockPath, "utf8"));
}

function compareVersions(left, right) {
  const result = versionCollator.compare(left, right);
  if (result < 0) {
    return -1;
  }
  if (result > 0) {
    return 1;
  }
  return 0;
}

function isStableVersion(version) {
  return !/(?:^|[._-]|\d)(?:a|b|rc|alpha|beta|dev|pre|preview)\d*/i.test(version);
}

function hasInstallableFiles(files) {
  return Array.isArray(files) && files.some((file) => file?.yanked !== true);
}

function pickLatestStableVersion(metadata) {
  const hintedVersion = metadata?.info?.version;
  if (hintedVersion && isStableVersion(hintedVersion) && hasInstallableFiles(metadata?.releases?.[hintedVersion])) {
    return hintedVersion;
  }

  const stableVersions = Object.entries(metadata?.releases ?? {})
    .filter(([version, files]) => isStableVersion(version) && hasInstallableFiles(files))
    .map(([version]) => version)
    .sort(compareVersions);

  if (stableVersions.length > 0) {
    return stableVersions.at(-1);
  }

  if (hintedVersion) {
    return hintedVersion;
  }

  throw new Error("PyPI metadata did not contain any usable pinterest-dl releases");
}

function latestPublishedAt(metadata, version) {
  const files = metadata?.releases?.[version] ?? [];
  const timestamps = files
    .filter((file) => file?.yanked !== true && typeof file?.upload_time_iso_8601 === "string")
    .map((file) => file.upload_time_iso_8601)
    .sort();
  return timestamps.at(-1) ?? null;
}

async function fetchJson(url, timeoutMs) {
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      headers: {
        accept: "application/json",
      },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }
    return await response.json();
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error(`Timed out fetching ${url} after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutHandle);
  }
}

function buildSummary(lock, metadata) {
  const lockedVersion = String(lock?.upstream?.version ?? "").trim();
  const packageName = String(lock?.upstream?.package ?? "").trim();

  if (!packageName || !lockedVersion) {
    throw new Error("lock.json is missing upstream.package or upstream.version");
  }

  const latestVersion = pickLatestStableVersion(metadata);
  const comparisonResult = compareVersions(lockedVersion, latestVersion);
  const comparison =
    comparisonResult < 0 ? "behind" : comparisonResult > 0 ? "ahead" : "current";

  return {
    package: packageName,
    packageUrl: `https://pypi.org/project/${packageName}/`,
    lockedVersion,
    latestVersion,
    latestPublishedAt: latestPublishedAt(metadata, latestVersion),
    updateAvailable: comparison === "behind",
    comparison,
  };
}

function writeGithubOutputs(outputPath, summary) {
  const outputs = {
    package_name: summary.package,
    package_url: summary.packageUrl,
    locked_version: summary.lockedVersion,
    latest_version: summary.latestVersion,
    latest_published_at: summary.latestPublishedAt ?? "",
    update_available: String(summary.updateAvailable),
    comparison: summary.comparison,
  };

  for (const [key, value] of Object.entries(outputs)) {
    appendFileSync(outputPath, `${key}=${value}\n`, "utf8");
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const timeoutMs = Number.parseInt(String(args["timeout-ms"] ?? "10000"), 10);
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error(`Invalid --timeout-ms value: ${args["timeout-ms"]}`);
  }

  const lock = readLock();
  const packageName = lock?.upstream?.package;
  if (!packageName) {
    throw new Error("lock.json is missing upstream.package");
  }

  const metadataUrl = `https://pypi.org/pypi/${packageName}/json`;
  console.log(`>>> [Node] Checking pinned ${packageName} version against PyPI`);
  const metadata = await fetchJson(metadataUrl, timeoutMs);
  const summary = buildSummary(lock, metadata);

  if (args["github-output"]) {
    writeGithubOutputs(args["github-output"], summary);
  }

  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(`>>> [Node] Pinterest sidecar upstream check failed: ${error.message}`);
  process.exitCode = 1;
});
