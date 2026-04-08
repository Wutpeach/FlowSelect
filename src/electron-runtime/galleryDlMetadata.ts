import { promises as fs } from "node:fs";
import path from "node:path";

import { runStreamingCommand } from "./processRunner.js";
import { cleanupCookiesFile, writeCookiesFile } from "./sidecarCookies.js";
import type { RuntimeBinaryPaths } from "./contracts.js";

type GalleryDlMetadataProbeOptions = {
  sourceUrl: string;
  pageUrl?: string;
  cookies?: string;
  binaries: RuntimeBinaryPaths;
  signal?: AbortSignal;
};

const WEAK_GALLERY_DL_TITLE_PATTERNS = [
  /^instagram(?:\s*\(\d+\))?$/i,
  /^instagram photos and videos$/i,
  /^pinterest$/i,
  /^weibo(?:\s*[–—-]\s*.+)?$/i,
  /^微博(?:\s*[–—-]\s*.+)?$/u,
  /^x$/i,
  /^twitter$/i,
  /^gallery-dl$/i,
] as const;
const WEAK_GALLERY_DL_TITLE_SUBSTRINGS = [
  "随时随地发现新鲜事",
] as const;
type MetadataPathSegment = string | number;
type MetadataPath = readonly MetadataPathSegment[];

const normalizeCandidateText = (value: unknown): string | undefined => {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized || undefined;
};

const truncateCandidateText = (
  value: string,
  maxLength: number,
): string => (
  value.length <= maxLength
    ? value
    : `${value.slice(0, Math.max(1, maxLength - 1)).trimEnd()}…`
);

const shouldPreferStableId = (value: string): boolean => (
  value.length <= 16 || /[a-z]/i.test(value)
);

const isWeakGalleryDlTitle = (value: string): boolean => (
  value.length < 4
  || WEAK_GALLERY_DL_TITLE_PATTERNS.some((pattern) => pattern.test(value))
  || WEAK_GALLERY_DL_TITLE_SUBSTRINGS.some((fragment) => value.includes(fragment))
);

const readNestedString = (
  value: unknown,
  path: MetadataPath,
): string | undefined => {
  let current: unknown = value;
  for (const segment of path) {
    if (typeof segment === "number") {
      if (!Array.isArray(current)) {
        return undefined;
      }
      current = current[segment];
      continue;
    }

    if (!current || typeof current !== "object" || Array.isArray(current)) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[segment];
  }

  return normalizeCandidateText(current);
};

const readFirstString = (
  value: unknown,
  paths: ReadonlyArray<MetadataPath>,
): string | undefined => {
  for (const path of paths) {
    const candidate = readNestedString(value, path);
    if (candidate) {
      return candidate;
    }
  }
  return undefined;
};

export const extractGalleryDlProbeTitle = (value: unknown): string | undefined => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const descriptiveText = [
    ["title"],
    ["caption"],
    ["content"],
    ["description"],
    ["text"],
    ["text_raw"],
    ["message"],
    ["body"],
    ["note"],
    ["status", "text_raw"],
    ["mblog", "text_raw"],
    ["longText", "longTextContent"],
    ["longText", "content"],
    ["node", "text"],
    ["edge_media_to_caption", "edges", 0, "node", "text"],
  ].map((path) => readNestedString(value, path))
    .find((candidate) => candidate && !isWeakGalleryDlTitle(candidate));

  const author = readFirstString(value, [
    ["username"],
    ["screen_name"],
    ["fullname"],
    ["user", "username"],
    ["user", "screen_name"],
    ["user", "fullname"],
    ["user", "full_name"],
    ["user", "name"],
    ["author", "username"],
    ["author", "name"],
    ["owner", "username"],
    ["owner", "fullname"],
    ["owner", "full_name"],
    ["owner", "name"],
    ["account", "username"],
    ["account", "name"],
    ["blog", "name"],
    ["channel", "name"],
  ]);

  const stableId = readFirstString(value, [
    ["post_shortcode"],
    ["shortcode"],
    ["bid"],
    ["mblogid"],
    ["idstr"],
    ["code"],
    ["post_id"],
    ["media_id"],
    ["tweet_id"],
    ["pin_id"],
    ["id"],
  ]);

  if (author && stableId && shouldPreferStableId(stableId)) {
    return `${author} - ${stableId}`;
  }

  if (author && descriptiveText) {
    const compactDescription = truncateCandidateText(descriptiveText, 48);
    return descriptiveText.toLowerCase().startsWith(author.toLowerCase())
      ? compactDescription
      : `${author} - ${compactDescription}`;
  }

  if (descriptiveText) {
    return truncateCandidateText(descriptiveText, 64);
  }

  if (author && stableId) {
    return `${author} - ${stableId}`;
  }

  if (stableId && !isWeakGalleryDlTitle(stableId)) {
    return stableId;
  }

  const entries = (value as Record<string, unknown>).entries;
  if (Array.isArray(entries)) {
    for (const entry of entries) {
      const candidate = extractGalleryDlProbeTitle(entry);
      if (candidate) {
        return candidate;
      }
    }
  }

  const weakTitle = readNestedString(value, ["title"]);
  return weakTitle && !isWeakGalleryDlTitle(weakTitle)
    ? weakTitle
    : undefined;
};

export const probeGalleryDlMetadataTitle = async ({
  sourceUrl,
  cookies,
  binaries,
  signal,
}: GalleryDlMetadataProbeOptions): Promise<string | undefined> => {
  if (!binaries.galleryDl) {
    return undefined;
  }

  const args = [
    "--dump-json",
    "--simulate",
    "--config-ignore",
  ];

  const cookiesPath = await writeCookiesFile(
    `gallery-title-probe-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    cookies,
  );
  if (cookiesPath) {
    args.push("--cookies", cookiesPath);
  }

  args.push(sourceUrl);

  const stdoutLines: string[] = [];
  try {
    const exitCode = await runStreamingCommand(binaries.galleryDl, args, {
      env: process.env,
      signal,
      onStdoutLine: (line) => {
        if (line.trim()) {
          stdoutLines.push(line);
        }
      },
    });
    if (exitCode !== 0) {
      return undefined;
    }

    for (const rawLine of stdoutLines) {
      const line = rawLine.trim();
      if (!line) {
        continue;
      }
      try {
        const metadata = JSON.parse(line) as unknown;
        const title = extractGalleryDlProbeTitle(metadata);
        if (title) {
          return title;
        }
      } catch {
        continue;
      }
    }

    return undefined;
  } catch {
    return undefined;
  } finally {
    await cleanupCookiesFile(cookiesPath);
  }
};

export const resolveGalleryDlMetadataTitleFromSidecars = async (
  outputDir: string,
  outputStem: string,
  filePath?: string,
): Promise<string | undefined> => {
  const entries: string[] = await fs.readdir(outputDir).catch((): string[] => []);
  const fileStem = filePath ? path.parse(filePath).name : outputStem;
  const exactCandidates = [
    `${outputStem}.info.json`,
    `${outputStem}.json`,
    `${fileStem}.info.json`,
    `${fileStem}.json`,
    "info.json",
  ];
  const seen = new Set<string>();
  const exactSidecars = exactCandidates
    .filter((entry) => entries.includes(entry))
    .filter((entry) => {
      if (seen.has(entry)) {
        return false;
      }
      seen.add(entry);
      return true;
    });

  const fallbackSidecars = entries
    .filter((entry) => /\.json$/i.test(entry))
    .filter((entry) => !seen.has(entry))
    .sort();

  const sidecars = [...exactSidecars, ...fallbackSidecars];

  for (const entry of sidecars) {
    const raw = await fs.readFile(path.join(outputDir, entry), "utf8").catch(() => null);
    if (!raw) {
      continue;
    }

    try {
      const metadata = JSON.parse(raw) as unknown;
      const title = extractGalleryDlProbeTitle(metadata);
      if (title) {
        return title;
      }
    } catch {
      continue;
    }
  }

  return undefined;
};

export const cleanupGalleryDlMetadataSidecars = async (
  outputDir: string,
  outputStem: string,
  filePath?: string,
): Promise<void> => {
  const fileStem = filePath ? path.parse(filePath).name : outputStem;
  const sidecarCandidates = new Set([
    `${outputStem}.info.json`,
    `${outputStem}.json`,
    `${fileStem}.info.json`,
    `${fileStem}.json`,
    "info.json",
  ]);

  await Promise.all(Array.from(sidecarCandidates)
    .map((entry) => fs.unlink(path.join(outputDir, entry)).catch(() => undefined)));
};
