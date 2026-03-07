import fs from "node:fs";
import path from "node:path";
import process from "node:process";

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

updateJsonFile("src-tauri/tauri.conf.json", (tauriConfig) => {
  tauriConfig.version = nextVersion;
});

updateTextFile("src-tauri/Cargo.toml", (cargoToml) => {
  const sections = cargoToml.split(/\n(?=\[)/);
  const nextSections = sections.map((section) => {
    if (!section.startsWith("[package]")) {
      return section;
    }

    return section.replace(/^version\s*=\s*"[^"]+"$/m, `version = "${nextVersion}"`);
  });

  return nextSections.join("\n");
});

updateTextFile("src/constants/appVersion.ts", () => {
  return `export const APP_VERSION = "${nextVersion}";\n`;
});

console.log(`Updated version to ${nextVersion}`);
