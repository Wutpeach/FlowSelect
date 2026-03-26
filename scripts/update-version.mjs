import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { execSync } from "node:child_process";

const nextVersion = process.argv[2]?.trim();

if (!nextVersion) {
  console.error("Usage: node ./scripts/update-version.mjs <version>");
  process.exit(1);
}

if (!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(nextVersion)) {
  console.error(`Invalid version: ${nextVersion}`);
  process.exit(1);
}

const repoRoot = process.cwd();

const safeExec = (command) => {
  try {
    return execSync(command, {
      cwd: repoRoot,
      stdio: ["ignore", "pipe", "ignore"],
      encoding: "utf8",
    }).trim();
  } catch {
    return "";
  }
};

const compareSemverLike = (left, right) => {
  const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
  return collator.compare(left, right);
};

const pickLatestGitTag = () => {
  const raw = safeExec('git tag --list "v*"');
  if (!raw) {
    return null;
  }

  const tags = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((tag) => /^v\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(tag));

  if (tags.length === 0) {
    return null;
  }

  // Sort by the version substring. Good enough for our tag format (`vX.Y.Z...`).
  tags.sort((a, b) => compareSemverLike(a.slice(1), b.slice(1)));
  return tags.at(-1) ?? null;
};

const updateJsonFile = (relativePath, updater) => {
  const filePath = path.join(repoRoot, relativePath);
  const raw = fs.readFileSync(filePath, "utf8");
  const parsed = JSON.parse(raw);
  updater(parsed);
  fs.writeFileSync(filePath, `${JSON.stringify(parsed, null, 2)}\n`);
};

const updateTextFile = (relativePath, updater) => {
  const filePath = path.join(repoRoot, relativePath);
  const raw = fs.readFileSync(filePath, "utf8");
  const next = updater(raw);
  fs.writeFileSync(filePath, next);
};

updateJsonFile("package.json", (pkg) => {
  pkg.version = nextVersion;
});

updateJsonFile("package-lock.json", (lockfile) => {
  lockfile.version = nextVersion;
  if (lockfile.packages?.[""]) {
    lockfile.packages[""].version = nextVersion;
  }
});

updateTextFile("browser-extension/manifest.json", (manifestJson) => {
  const versionFieldPattern = /^(\s*"version"\s*:\s*")[^"]+(")/m;
  if (!versionFieldPattern.test(manifestJson)) {
    throw new Error('Could not find "version" field in browser-extension/manifest.json');
  }

  return manifestJson.replace(
    versionFieldPattern,
    `$1${nextVersion}$2`,
  );
});

updateTextFile("src/constants/appVersion.ts", () => {
  return `export const APP_VERSION = "${nextVersion}";\n`;
});

const ensureReleaseNotes = (version) => {
  const releaseNotesDir = path.join(repoRoot, "release-notes");
  const templatePath = path.join(releaseNotesDir, "TEMPLATE.md");
  const notePath = path.join(releaseNotesDir, `v${version}.md`);

  if (!fs.existsSync(releaseNotesDir)) {
    console.warn(`release-notes directory not found at ${releaseNotesDir}; skipping notes scaffold.`);
    return;
  }

  if (fs.existsSync(notePath)) {
    console.log(`Release note already exists: release-notes/v${version}.md`);
    return;
  }

  if (!fs.existsSync(templatePath)) {
    console.warn("release-notes/TEMPLATE.md not found; skipping notes scaffold.");
    return;
  }

  const template = fs.readFileSync(templatePath, "utf8");
  const currentTag = `v${version}`;
  const previousTag = pickLatestGitTag() ?? "<previous-tag>";

  const contents = template
    .replaceAll("<current-tag>", currentTag)
    .replaceAll("<previous-tag>", previousTag);

  fs.writeFileSync(notePath, contents);
  console.log(`Created release notes scaffold: release-notes/v${version}.md`);
};

ensureReleaseNotes(nextVersion);
console.log(`Updated version to ${nextVersion}`);
