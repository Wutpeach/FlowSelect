const APP_VERSION_PATTERN = /^(?<major>\d+)\.(?<minor>\d+)\.(?<patch>\d+)(?:-(?<prerelease>[0-9A-Za-z.-]+))?(?:\+(?<build>[0-9A-Za-z.-]+))?$/;

type ParsedAppVersion = {
  raw: string;
  major: number;
  minor: number;
  patch: number;
  prerelease: string;
  build: string;
};

const parseAppVersion = (appVersion: string): ParsedAppVersion | null => {
  const normalized = String(appVersion || "").trim();
  const match = APP_VERSION_PATTERN.exec(normalized);
  if (!match?.groups) {
    return null;
  }

  return {
    raw: normalized,
    major: Number(match.groups.major),
    minor: Number(match.groups.minor),
    patch: Number(match.groups.patch),
    prerelease: match.groups.prerelease || "",
    build: match.groups.build || "",
  };
};

const isNumericIdentifier = (value: string): boolean => /^\d+$/.test(value);

const comparePrereleaseIdentifiers = (left: string, right: string): number => {
  const leftIsNumeric = isNumericIdentifier(left);
  const rightIsNumeric = isNumericIdentifier(right);

  if (leftIsNumeric && rightIsNumeric) {
    return Number(left) - Number(right);
  }

  if (leftIsNumeric) {
    return -1;
  }

  if (rightIsNumeric) {
    return 1;
  }

  return left.localeCompare(right);
};

const comparePrerelease = (left: string, right: string): number => {
  if (!left && !right) {
    return 0;
  }

  if (!left) {
    return 1;
  }

  if (!right) {
    return -1;
  }

  const leftParts = left.split(".");
  const rightParts = right.split(".");
  const width = Math.max(leftParts.length, rightParts.length);

  for (let index = 0; index < width; index += 1) {
    const leftValue = leftParts[index];
    const rightValue = rightParts[index];

    if (leftValue == null) {
      return -1;
    }

    if (rightValue == null) {
      return 1;
    }

    const difference = comparePrereleaseIdentifiers(leftValue, rightValue);
    if (difference !== 0) {
      return difference > 0 ? 1 : -1;
    }
  }

  return 0;
};

export const compareAppVersions = (left: string, right: string): number => {
  const leftVersion = parseAppVersion(left);
  const rightVersion = parseAppVersion(right);

  if (!leftVersion || !rightVersion) {
    return String(left).localeCompare(String(right));
  }

  const releaseDifference = (
    (leftVersion.major - rightVersion.major)
    || (leftVersion.minor - rightVersion.minor)
    || (leftVersion.patch - rightVersion.patch)
  );
  if (releaseDifference !== 0) {
    return releaseDifference > 0 ? 1 : -1;
  }

  return comparePrerelease(leftVersion.prerelease, rightVersion.prerelease);
};
