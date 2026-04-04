const APP_VERSION_PATTERN = /^(?<major>\d+)\.(?<minor>\d+)\.(?<patch>\d+)(?:-(?<prerelease>[0-9A-Za-z.-]+))?(?:\+(?<build>[0-9A-Za-z.-]+))?$/;
const CHROMIUM_VERSION_PATTERN = /^\d+(?:\.\d+){0,3}$/;
const CHROMIUM_MAX_SEGMENT = 65535;

function parseAppVersion(appVersion) {
  const normalized = String(appVersion || "").trim();
  const match = APP_VERSION_PATTERN.exec(normalized);
  if (!match?.groups) {
    throw new Error(`Invalid app version: ${appVersion}`);
  }

  return {
    raw: normalized,
    major: Number(match.groups.major),
    minor: Number(match.groups.minor),
    patch: Number(match.groups.patch),
    prerelease: match.groups.prerelease || "",
    build: match.groups.build || "",
  };
}

function assertChromiumSegment(segment, label) {
  if (!Number.isInteger(segment) || segment < 0 || segment > CHROMIUM_MAX_SEGMENT) {
    throw new Error(`${label} must be an integer between 0 and ${CHROMIUM_MAX_SEGMENT}. Received: ${segment}`);
  }
}

function extractPrereleaseOrdinal(prerelease) {
  if (!prerelease) {
    return null;
  }

  const numericTokens = prerelease.match(/\d+/g);
  if (!numericTokens || numericTokens.length === 0) {
    return 1;
  }

  return Number(numericTokens.at(-1));
}

export function deriveChromiumExtensionVersion(appVersion) {
  const parsed = parseAppVersion(appVersion);
  const segments = [parsed.major, parsed.minor, parsed.patch];

  for (const [index, segment] of segments.entries()) {
    assertChromiumSegment(segment, `Version segment ${index + 1}`);
  }

  const prereleaseOrdinal = extractPrereleaseOrdinal(parsed.prerelease);
  if (prereleaseOrdinal !== null) {
    assertChromiumSegment(prereleaseOrdinal, "Prerelease version segment");
    segments.push(prereleaseOrdinal);
  }

  return segments.join(".");
}

export function isValidChromiumExtensionVersion(version) {
  const normalized = String(version || "").trim();
  if (!CHROMIUM_VERSION_PATTERN.test(normalized)) {
    return false;
  }

  return normalized
    .split(".")
    .every((segment) => {
      if (!/^\d+$/.test(segment)) {
        return false;
      }
      const value = Number(segment);
      return Number.isInteger(value) && value >= 0 && value <= CHROMIUM_MAX_SEGMENT;
    });
}

export function assertValidChromiumExtensionVersion(version, label = "Extension manifest version") {
  if (!isValidChromiumExtensionVersion(version)) {
    throw new Error(`${label} is invalid for Chromium: ${version}`);
  }
}

export function applyAppVersionToExtensionManifest(manifest, appVersion) {
  const nextManifest = {
    ...manifest,
    version: deriveChromiumExtensionVersion(appVersion),
  };

  assertValidChromiumExtensionVersion(nextManifest.version);

  if (String(appVersion).trim() === nextManifest.version) {
    delete nextManifest.version_name;
    return nextManifest;
  }

  nextManifest.version_name = String(appVersion).trim();
  return nextManifest;
}
