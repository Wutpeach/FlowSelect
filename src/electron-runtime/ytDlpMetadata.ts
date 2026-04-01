import { runStreamingCommand } from "./processRunner.js";
import { cleanupCookiesFile, writeCookiesFile } from "./sidecarCookies.js";
import type { RuntimeBinaryPaths } from "./contracts.js";
import type { DownloadSelectionScope } from "../core/index.js";

type YtDlpMetadataProbeOptions = {
  sourceUrl: string;
  pageUrl?: string;
  cookies?: string;
  selectionScope?: DownloadSelectionScope;
  binaries: RuntimeBinaryPaths;
  signal?: AbortSignal;
};

const isYouTubeUrl = (value: string): boolean =>
  value.includes("youtube.com/") || value.includes("youtu.be/");

const appendYtDlpSiteArgs = (
  args: string[],
  sourceUrl: string,
  binaries: RuntimeBinaryPaths,
): void => {
  if (!isYouTubeUrl(sourceUrl)) {
    return;
  }

  args.push(
    "--extractor-args",
    "youtube:player_js_variant=tv",
    "--remote-components",
    "ejs:github",
  );

  if (!binaries.deno) {
    return;
  }

  if (process.platform === "win32") {
    args.push("--js-runtimes", "deno", "--js-runtimes", "node");
    return;
  }

  args.push("--js-runtimes", "node", "--js-runtimes", "deno");
};

const readTitleFromMetadata = (value: unknown): string | undefined => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const payload = value as Record<string, unknown>;
  const title = typeof payload.title === "string" ? payload.title.trim() : "";
  if (title && payload._type !== "playlist") {
    return title;
  }

  const entries = Array.isArray(payload.entries) ? payload.entries : [];
  if (entries.length === 1) {
    const entry = entries[0];
    if (entry && typeof entry === "object" && !Array.isArray(entry)) {
      const entryPayload = entry as Record<string, unknown>;
      const entryTitleValue = entryPayload.title;
      const entryTitle = typeof entryTitleValue === "string"
        ? entryTitleValue.trim()
        : "";
      if (entryTitle) {
        return entryTitle;
      }
    }
  }

  return title || undefined;
};

export const probeYtDlpMetadataTitle = async ({
  sourceUrl,
  pageUrl,
  cookies,
  selectionScope,
  binaries,
  signal,
}: YtDlpMetadataProbeOptions): Promise<string | undefined> => {
  const args = [
    "--dump-single-json",
    "--no-warnings",
    "--ignore-config",
    "--encoding",
    "utf-8",
  ];

  if (selectionScope === "current_item") {
    args.push("--no-playlist");
  }
  if (pageUrl) {
    args.push("--add-header", `Referer:${pageUrl}`);
  }

  const cookiesPath = await writeCookiesFile(
    `title-probe-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    cookies,
  );
  if (cookiesPath) {
    args.push("--cookies", cookiesPath);
  }

  appendYtDlpSiteArgs(args, sourceUrl, binaries);
  args.push(sourceUrl);

  const stdoutLines: string[] = [];
  try {
    const exitCode = await runStreamingCommand(binaries.ytDlp, args, {
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

    for (let index = stdoutLines.length - 1; index >= 0; index -= 1) {
      const line = stdoutLines[index].trim();
      if (!line) {
        continue;
      }
      try {
        const metadata = JSON.parse(line) as unknown;
        const title = readTitleFromMetadata(metadata);
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
