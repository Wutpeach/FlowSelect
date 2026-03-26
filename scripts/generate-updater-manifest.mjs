import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      continue;
    }

    const key = token.slice(2);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      parsed[key] = "true";
      continue;
    }

    parsed[key] = value;
    index += 1;
  }
  return parsed;
}

function assertArg(value, label) {
  if (!value || !String(value).trim()) {
    throw new Error(`Missing required argument: --${label}`);
  }
  return String(value).trim();
}

function listFilesRecursive(rootDir) {
  const results = [];
  const pending = [rootDir];

  while (pending.length > 0) {
    const currentDir = pending.pop();
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        pending.push(fullPath);
        continue;
      }
      results.push(fullPath);
    }
  }

  return results;
}

function findRequiredFile(files, pattern, label) {
  const match = files.find((filePath) => pattern.test(path.basename(filePath)));
  if (!match) {
    throw new Error(`Unable to find ${label} matching ${pattern}`);
  }
  return match;
}

function findRequiredFileByPatterns(files, patterns, label) {
  for (const pattern of patterns) {
    const match = files.find((filePath) => pattern.test(path.basename(filePath)));
    if (match) {
      return match;
    }
  }

  throw new Error(`Unable to find ${label} matching any of: ${patterns.map(String).join(", ")}`);
}

function buildReleaseAssetUrl(repo, releaseTag, assetFilePath) {
  const assetName = path.basename(assetFilePath);
  return `https://github.com/${repo}/releases/download/${releaseTag}/${encodeURIComponent(assetName)}`;
}

function createPlatformEntry(repo, releaseTag, assetPath) {
  return {
    url: buildReleaseAssetUrl(repo, releaseTag, assetPath),
  };
}

function main() {
  const parsed = parseArgs(args);
  const version = assertArg(parsed.version, "version");
  const releaseTag = assertArg(parsed["release-tag"], "release-tag");
  const repo = assertArg(parsed.repo, "repo");
  const notesFile = assertArg(parsed["notes-file"], "notes-file");
  const pubDate = assertArg(parsed["pub-date"], "pub-date");
  const artifactsDir = path.resolve(assertArg(parsed["artifacts-dir"], "artifacts-dir"));
  const outputPath = path.resolve(assertArg(parsed.output, "output"));

  const files = listFilesRecursive(artifactsDir);

  const windowsAsset = findRequiredFileByPatterns(
    files,
    [
      /^FlowSelect_.*_windows_x64_installer\.exe$/,
      /^FlowSelect_.*_x64-setup\.exe$/,
    ],
    "Windows updater asset",
  );

  const manifest = {
    version,
    notes: fs.readFileSync(path.resolve(notesFile), "utf8").trim(),
    pub_date: pubDate,
    platforms: {
      "windows-x86_64": createPlatformEntry(repo, releaseTag, windowsAsset),
    },
  };

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(manifest, null, 2)}\n`);
}

main();
