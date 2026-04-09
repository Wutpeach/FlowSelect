import type maxUrlModule from "image-max-url";
import type { MaxUrlCandidate, MaxUrlFn, MaxUrlOptions } from "image-max-url";

export type MaxUrlUpgradeCandidate = {
  url: string;
  headers: Record<string, string>;
  confidence: "medium" | "high";
  notes: string[];
};

let maxUrlModulePromise: Promise<MaxUrlFn> | null = null;

function parseHttpUrl(raw: string): URL | null {
  if (typeof raw !== "string" || !/^https?:\/\//i.test(raw.trim())) {
    return null;
  }

  try {
    return new URL(raw);
  } catch {
    return null;
  }
}

function normalizeHeaders(
  value: Record<string, string | null | undefined> | undefined,
): Record<string, string> {
  if (!value) {
    return {};
  }

  const headers = Object.entries(value).flatMap(([key, headerValue]) => {
    if (typeof headerValue !== "string" || !headerValue.trim()) {
      return [];
    }
    return [[key, headerValue.trim()] as const];
  });

  return Object.fromEntries(headers);
}

function normalizeCandidate(
  entry: MaxUrlCandidate | null | undefined,
): (MaxUrlCandidate & { url: string }) | null {
  if (!entry || typeof entry.url !== "string" || !entry.url.trim()) {
    return null;
  }

  const parsed = parseHttpUrl(entry.url);
  if (!parsed) {
    return null;
  }

  return {
    ...entry,
    url: parsed.toString(),
  };
}

function hasBlockingProblems(candidate: MaxUrlCandidate): boolean {
  return candidate.bad === true
    || candidate.bad === "mask"
    || candidate.fake === true
    || candidate.video === true
    || candidate.likely_broken === true
    || candidate.problems?.possibly_different === true
    || candidate.problems?.possibly_broken === true;
}

function sameHost(left: URL, right: URL): boolean {
  return left.hostname.toLowerCase() === right.hostname.toLowerCase();
}

function candidateScore(candidate: MaxUrlCandidate): number {
  let score = 0;

  if (candidate.is_original) {
    score += 100;
  }
  if (candidate.always_ok) {
    score += 40;
  }
  if (candidate.headers && Object.keys(candidate.headers).length > 0) {
    score += 15;
  }
  if (candidate.problems?.watermark) {
    score -= 120;
  }
  if (candidate.problems?.smaller) {
    score -= 180;
  }
  if (candidate.problems?.possibly_upscaled) {
    score -= 30;
  }

  return score;
}

async function loadMaxUrl(): Promise<MaxUrlFn> {
  if (!maxUrlModulePromise) {
    maxUrlModulePromise = import("image-max-url").then((module) => {
      const resolved = (module.default ?? module) as typeof maxUrlModule;
      return resolved as MaxUrlFn;
    });
  }

  return maxUrlModulePromise;
}

function resolveCandidatesWithMaxUrl(
  maxUrl: MaxUrlFn,
  imageUrl: string,
): Promise<MaxUrlCandidate[]> {
  const options: MaxUrlOptions = {
    fill_object: true,
    iterations: 20,
    use_cache: true,
    exclude_videos: true,
    include_pastobjs: true,
    force_page: false,
    allow_thirdparty: false,
  };

  return new Promise((resolve, reject) => {
    try {
      maxUrl(imageUrl, {
        ...options,
        cb(result) {
          resolve(Array.isArray(result) ? result : []);
        },
      });
    } catch (error) {
      reject(error);
    }
  });
}

export async function resolveMaxurlUpgrade(imageUrl: string): Promise<MaxUrlUpgradeCandidate | null> {
  const originalUrl = parseHttpUrl(imageUrl);
  if (!originalUrl) {
    return null;
  }

  const maxUrl = await loadMaxUrl();
  const candidates = await resolveCandidatesWithMaxUrl(maxUrl, originalUrl.toString());

  const bestCandidate = candidates
    .map((candidate) => normalizeCandidate(candidate))
    .filter((candidate): candidate is MaxUrlCandidate & { url: string } => candidate !== null)
    .filter((candidate) => candidate.url !== originalUrl.toString())
    .filter((candidate) => !hasBlockingProblems(candidate))
    .filter((candidate) => {
      const candidateUrl = parseHttpUrl(candidate.url);
      return candidateUrl ? sameHost(originalUrl, candidateUrl) : false;
    })
    .sort((left, right) => candidateScore(right) - candidateScore(left))[0];

  if (!bestCandidate) {
    return null;
  }

  const notes = ["maxurl returned a safe larger candidate on the same host"];
  if (bestCandidate.is_original) {
    notes.push("candidate is marked as original by maxurl");
  }

  return {
    url: bestCandidate.url,
    headers: normalizeHeaders(bestCandidate.headers),
    confidence: bestCandidate.is_original ? "high" : "medium",
    notes,
  };
}

export function resetMaxUrlModuleForTests(): void {
  maxUrlModulePromise = null;
}
