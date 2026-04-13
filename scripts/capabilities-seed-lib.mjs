import { mkdir, readFile, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import http from "node:http";
import https from "node:https";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export const repoRoot = path.resolve(__dirname, "..");

export const YT_DLP_SUPPORTED_SITES_URL =
  "https://raw.githubusercontent.com/yt-dlp/yt-dlp/master/supportedsites.md";
export const GALLERY_DL_SUPPORTED_SITES_URL =
  "https://raw.githubusercontent.com/mikf/gallery-dl/master/docs/supportedsites.md";
export const DEFAULT_CAPABILITY_SEED_OUTPUT = path.join(
  repoRoot,
  "src",
  "assets",
  "capabilities-seed.json",
);

const requestModuleFor = (url) => (url.startsWith("https:") ? https : http);

const normalizeWhitespace = (value) => value.replace(/\s+/g, " ").trim();

const stripZeroWidth = (value) => value.replace(/[\u200B-\u200D\uFEFF]/g, "");

const normalizeSiteId = (value) => normalizeWhitespace(stripZeroWidth(value)).toLowerCase();

const decodeHtmlEntities = (value) => value
  .replace(/&amp;/g, "&")
  .replace(/&lt;/g, "<")
  .replace(/&gt;/g, ">")
  .replace(/&quot;/g, "\"")
  .replace(/&#39;/g, "'");

const stripHtml = (value) => decodeHtmlEntities(value.replace(/<[^>]+>/g, " "));

const stripMarkdownLinks = (value) => value
  .replace(/\[\*([^\]]+)\*\]\([^)]*\)/g, "$1")
  .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1");

const normalizeHost = (value) => value.toLowerCase().replace(/^www\./, "");

const authRequirementFromGalleryDl = (value) => {
  const normalized = normalizeWhitespace(value).toLowerCase();
  if (!normalized) {
    return "none";
  }
  if (normalized.includes("required")) {
    return "required";
  }
  if (normalized.includes("supported") || normalized.includes("optional")) {
    return "optional";
  }
  return "unknown";
};

const authRequirementFromYtDlp = (value) => {
  const normalized = normalizeWhitespace(value).toLowerCase();
  if (!normalized) {
    return "unknown";
  }
  if (normalized.includes("netrc machine")) {
    return "required";
  }
  return "unknown";
};

const cleanYtDlpTail = (value, extractorId) => {
  if (!value) {
    return [];
  }

  const normalized = normalizeWhitespace(
    stripMarkdownLinks(value)
      .replace(/\(\*\*Currently broken\*\*\)/gi, "")
      .replace(/\(\s*##\s*"[^"]+"\s*\)/gi, ""),
  );

  if (!normalized || normalized.toLowerCase() === extractorId.toLowerCase()) {
    return [];
  }

  return [normalized];
};

const splitCapabilityHints = (value) => normalizeWhitespace(stripHtml(value))
  .split(/\s*,\s*/)
  .map((entry) => entry.trim())
  .filter(Boolean);

const toIsoTimestamp = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid timestamp: ${value}`);
  }
  return date.toISOString();
};

const extractUrlFromHtmlCell = (value) => {
  const hrefMatch = value.match(/https?:\/\/[^"'<> ]+/i);
  if (hrefMatch) {
    return hrefMatch[0];
  }
  const textMatch = stripHtml(value).match(/https?:\/\/\S+/i);
  return textMatch?.[0] ?? undefined;
};

export function parseYtDlpSupportedSitesDocument(document, fetchedAt) {
  const entries = [];
  const lines = document.split(/\r?\n/);

  for (const line of lines) {
    const match = line.match(/^\s*-\s+\*\*(.+?)\*\*(?::\s*(.*))?$/);
    if (!match) {
      continue;
    }

    const extractorId = stripZeroWidth(match[1]).trim();
    const tail = (match[2] ?? "").trim();
    const upstreamState = /\(\*\*Currently broken\*\*\)/i.test(tail)
      ? "reported_broken"
      : "reported_supported";
    const notes = cleanYtDlpTail(tail, extractorId);

    entries.push({
      siteId: normalizeSiteId(extractorId),
      displayName: extractorId,
      engine: "yt-dlp",
      sourceId: "yt-dlp-supportedsites",
      claimStatus: "claimed_supported",
      probeStatus: "unknown",
      authRequirement: authRequirementFromYtDlp(tail),
      upstreamState,
      matchHints: {
        extractorId,
        upstreamId: extractorId,
      },
      notes,
      importedAt: toIsoTimestamp(fetchedAt),
    });
  }

  return entries.sort((left, right) => left.siteId.localeCompare(right.siteId));
}

export function parseGalleryDlSupportedSitesDocument(document, fetchedAt) {
  const entries = [];
  const rowPattern = /<tr\b[^>]*id="([^"]+)"[^>]*>([\s\S]*?)<\/tr>/gi;

  for (const rowMatch of document.matchAll(rowPattern)) {
    const upstreamId = rowMatch[1];
    const rowHtml = rowMatch[2];
    const cells = [...rowHtml.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((cell) => cell[1]);
    if (cells.length < 4) {
      continue;
    }

    const displayName = normalizeWhitespace(stripHtml(cells[0]));
    const referenceUrl = extractUrlFromHtmlCell(cells[1]);
    const capabilityHints = splitCapabilityHints(cells[2]);
    const authCell = normalizeWhitespace(stripHtml(cells[3]));
    const notes = [];

    let hosts;
    if (referenceUrl) {
      try {
        hosts = [normalizeHost(new URL(referenceUrl).hostname)];
      } catch {
        hosts = undefined;
      }
    }

    if (authCell) {
      notes.push(`Authentication: ${authCell}`);
    }

    entries.push({
      siteId: normalizeSiteId(upstreamId),
      displayName,
      engine: "gallery-dl",
      sourceId: "gallery-dl-supportedsites",
      claimStatus: "claimed_supported",
      probeStatus: "unknown",
      authRequirement: authRequirementFromGalleryDl(authCell),
      upstreamState: "reported_supported",
      referenceUrl,
      matchHints: {
        hosts,
        upstreamId,
      },
      capabilityHints,
      notes,
      importedAt: toIsoTimestamp(fetchedAt),
    });
  }

  return entries.sort((left, right) => left.siteId.localeCompare(right.siteId));
}

export function buildCapabilitySeed({
  generatedAt = new Date().toISOString(),
  ytDlpDocument,
  galleryDlDocument,
  ytDlpFetchedAt = generatedAt,
  galleryDlFetchedAt = generatedAt,
}) {
  const ytDlpEntries = parseYtDlpSupportedSitesDocument(ytDlpDocument, ytDlpFetchedAt)
    .map(({ importedAt: _importedAt, ...entry }) => entry);
  const galleryDlEntries = parseGalleryDlSupportedSitesDocument(
    galleryDlDocument,
    galleryDlFetchedAt,
  ).map(({ importedAt: _importedAt, ...entry }) => entry);

  return {
    schemaVersion: 1,
    generatedAt: toIsoTimestamp(generatedAt),
    sources: [
      {
        id: "yt-dlp-supportedsites",
        type: "official_supported_sites",
        engine: "yt-dlp",
        label: "yt-dlp supported sites",
        url: YT_DLP_SUPPORTED_SITES_URL,
        fetchedAt: toIsoTimestamp(ytDlpFetchedAt),
        entryCount: ytDlpEntries.length,
        notes: [
          "Imported from the upstream supported-sites document.",
          "Entries are claimed support only and require probe/telemetry before being treated as verified.",
        ],
      },
      {
        id: "gallery-dl-supportedsites",
        type: "official_supported_sites",
        engine: "gallery-dl",
        label: "gallery-dl supported sites",
        url: GALLERY_DL_SUPPORTED_SITES_URL,
        fetchedAt: toIsoTimestamp(galleryDlFetchedAt),
        entryCount: galleryDlEntries.length,
        notes: [
          "Imported from the upstream supported-sites document.",
          "Entries are claimed support only and require probe/telemetry before being treated as verified.",
        ],
      },
    ],
    downloadCapabilities: [...ytDlpEntries, ...galleryDlEntries],
    interactionCapabilities: [],
  };
}

async function readTextViaHttp(source, redirectCount = 0) {
  if (redirectCount > 5) {
    throw new Error(`Too many redirects while fetching ${source}`);
  }

  return await new Promise((resolve, reject) => {
    const request = requestModuleFor(source).request(
      source,
      {
        headers: {
          Accept: "text/plain",
          "User-Agent": "FlowSelect-capabilities-seed-generator",
        },
      },
      (response) => {
        const statusCode = response.statusCode ?? 0;
        const location = typeof response.headers.location === "string"
          ? new URL(response.headers.location, source).toString()
          : null;

        if (statusCode >= 300 && statusCode < 400 && location) {
          response.resume();
          resolve(readTextViaHttp(location, redirectCount + 1));
          return;
        }

        if (statusCode < 200 || statusCode >= 300) {
          response.resume();
          reject(new Error(`Failed to fetch ${source}: ${statusCode}`));
          return;
        }

        const chunks = [];
        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          chunks.push(chunk);
        });
        response.on("end", () => {
          resolve(chunks.join(""));
        });
        response.on("error", reject);
      },
    );

    request.setTimeout(60_000, () => {
      request.destroy(new Error(`Timed out while fetching ${source}`));
    });
    request.on("error", reject);
    request.end();
  });
}

function readTextViaCurl(source) {
  const result = spawnSync("curl", ["-L", "--silent", "--show-error", source], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    const stderr = typeof result.stderr === "string" ? result.stderr.trim() : "";
    throw new Error(stderr || `curl failed for ${source}`);
  }
  return result.stdout;
}

export async function readTextFromSource(source) {
  if (/^https?:\/\//i.test(source)) {
    try {
      return await readTextViaHttp(source);
    } catch (error) {
      try {
        return readTextViaCurl(source);
      } catch (curlError) {
        const primary = error instanceof Error ? error.message : String(error);
        const fallback = curlError instanceof Error ? curlError.message : String(curlError);
        throw new Error(`Failed to fetch ${source}: ${primary}; curl fallback: ${fallback}`);
      }
    }
  }

  return await readFile(source, "utf8");
}

export async function generateCapabilitySeed({
  ytDlpSource = YT_DLP_SUPPORTED_SITES_URL,
  galleryDlSource = GALLERY_DL_SUPPORTED_SITES_URL,
  generatedAt = new Date().toISOString(),
}) {
  const [ytDlpDocument, galleryDlDocument] = await Promise.all([
    readTextFromSource(ytDlpSource),
    readTextFromSource(galleryDlSource),
  ]);

  return buildCapabilitySeed({
    generatedAt,
    ytDlpDocument,
    galleryDlDocument,
    ytDlpFetchedAt: generatedAt,
    galleryDlFetchedAt: generatedAt,
  });
}

export async function writeCapabilitySeed(outputPath, seed) {
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(seed, null, 2)}\n`, "utf8");
}
