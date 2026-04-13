import { describe, expect, it, vi } from "vitest";
import {
  DownloadRuntimeError,
  type DownloadEngine,
  type DownloadIntent,
  type EngineExecutionContext,
  type EnginePlan,
  type ResolvedDownloadPlan,
  type SiteProvider,
} from "../core/index.js";
import { createEngineRegistry } from "../engines/engine-registry.js";
import { DownloadOrchestrator } from "./download-orchestrator.js";
import { createSiteRegistry } from "../sites/site-registry.js";

const createVideoPlan = (engines: EnginePlan[]): ResolvedDownloadPlan => ({
  providerId: "test-provider",
  label: "Test plan",
  intent: {
    type: "video",
    siteId: "generic",
    originalUrl: "https://example.com/watch/42",
    pageUrl: "https://example.com/watch/42",
    priority: 100,
    candidates: [],
    preferredFormat: "best",
  },
  engines,
});

const createProvider = (plan: ResolvedDownloadPlan): SiteProvider => ({
  id: plan.providerId,
  matches: () => true,
  resolvePlan: () => plan,
});

const createEngine = (
  id: DownloadEngine["id"],
  options: {
    validateIntent?: (intent: DownloadIntent, plan: EnginePlan) => DownloadRuntimeError | null;
    execute?: (context: EngineExecutionContext) => Promise<{
      traceId: string;
      success: boolean;
      file_path?: string;
      error?: string;
    }>;
  } = {},
): DownloadEngine => ({
  id,
  validateIntent: options.validateIntent ?? (() => null),
  execute: options.execute ?? (async (context) => ({
    traceId: context.traceId,
    success: true,
    file_path: `/tmp/${id}.mp4`,
  })),
});

const createContext = (
  plan: ResolvedDownloadPlan,
  enginePlan: EnginePlan,
): EngineExecutionContext => ({
  traceId: "trace-1",
  plan,
  enginePlan,
  intent: plan.intent,
  outputDir: "/tmp",
  outputStem: "test",
  config: {},
  binaries: {
    ytDlp: "/tmp/yt-dlp",
    galleryDl: "/tmp/gallery-dl",
    ffmpeg: "/tmp/ffmpeg",
    ffprobe: "/tmp/ffprobe",
    deno: "/tmp/deno",
  },
  abortSignal: new AbortController().signal,
  onProgress: vi.fn(),
});

describe("DownloadOrchestrator", () => {
  it("falls back only for fallback-to-other-engine failures", async () => {
    const plan = createVideoPlan([
      {
        engine: "direct",
        priority: 100,
        when: "primary",
        reason: "try direct first",
        sourceUrl: "https://example.com/page/42",
        fallbackOn: "any",
      },
      {
        engine: "yt-dlp",
        priority: 90,
        when: "fallback",
        reason: "fallback to yt-dlp",
        sourceUrl: "https://example.com/page/42",
      },
    ]);
    const orchestrator = new DownloadOrchestrator(
      createSiteRegistry([createProvider(plan)]),
      createEngineRegistry([
        createEngine("direct", {
          validateIntent: () => new DownloadRuntimeError(
            "E_DIRECT_SOURCE_REQUIRED",
            "Direct engine requires a direct media URL",
          ),
        }),
        createEngine("yt-dlp"),
      ]),
    );

    const result = await orchestrator.execute(
      { url: "https://example.com/page/42" },
      createContext,
    );

    expect(result).toMatchObject({
      success: true,
      file_path: "/tmp/yt-dlp.mp4",
    });
  });

  it("stops the engine chain for auth-required failures even when the plan says any", async () => {
    const fallbackExecute = vi.fn();
    const plan = createVideoPlan([
      {
        engine: "gallery-dl",
        priority: 100,
        when: "primary",
        reason: "gallery first",
        sourceUrl: "https://example.com/page/42",
        fallbackOn: "any",
      },
      {
        engine: "yt-dlp",
        priority: 90,
        when: "fallback",
        reason: "yt-dlp fallback",
        sourceUrl: "https://example.com/page/42",
      },
    ]);
    const orchestrator = new DownloadOrchestrator(
      createSiteRegistry([createProvider(plan)]),
      createEngineRegistry([
        createEngine("gallery-dl", {
          execute: async () => {
            throw new DownloadRuntimeError(
              "E_EXECUTION_FAILED",
              "gallery-dl exited with code 1: cookies required for this resource",
            );
          },
        }),
        createEngine("yt-dlp", {
          execute: fallbackExecute,
        }),
      ]),
    );

    await expect(
      orchestrator.execute({ url: "https://example.com/page/42" }, createContext),
    ).rejects.toMatchObject({
      code: "E_EXECUTION_FAILED",
      classification: "auth_required",
    });

    expect(fallbackExecute).not.toHaveBeenCalled();
  });

  it("stops the engine chain for retry-same-engine failures until explicit retry support exists", async () => {
    const fallbackExecute = vi.fn();
    const plan = createVideoPlan([
      {
        engine: "yt-dlp",
        priority: 100,
        when: "primary",
        reason: "yt-dlp first",
        sourceUrl: "https://example.com/page/42",
        fallbackOn: "any",
      },
      {
        engine: "gallery-dl",
        priority: 90,
        when: "fallback",
        reason: "gallery fallback",
        sourceUrl: "https://example.com/page/42",
      },
    ]);
    const orchestrator = new DownloadOrchestrator(
      createSiteRegistry([createProvider(plan)]),
      createEngineRegistry([
        createEngine("yt-dlp", {
          execute: async () => {
            throw new DownloadRuntimeError(
              "E_EXECUTION_FAILED",
              "yt-dlp exited with code 1: request timed out while downloading webpage",
            );
          },
        }),
        createEngine("gallery-dl", {
          execute: fallbackExecute,
        }),
      ]),
    );

    await expect(
      orchestrator.execute({ url: "https://example.com/page/42" }, createContext),
    ).rejects.toMatchObject({
      code: "E_EXECUTION_FAILED",
      classification: "retry_same_engine",
    });

    expect(fallbackExecute).not.toHaveBeenCalled();
  });

  it("lets plans opt into classification-based fallback rules", async () => {
    const plan = createVideoPlan([
      {
        engine: "gallery-dl",
        priority: 100,
        when: "primary",
        reason: "gallery first",
        sourceUrl: "https://example.com/page/42",
        fallbackOnClassifications: ["fallback_to_other_engine"],
      },
      {
        engine: "yt-dlp",
        priority: 90,
        when: "fallback",
        reason: "yt-dlp fallback",
        sourceUrl: "https://example.com/page/42",
      },
    ]);
    const orchestrator = new DownloadOrchestrator(
      createSiteRegistry([createProvider(plan)]),
      createEngineRegistry([
        createEngine("gallery-dl", {
          execute: async () => {
            throw new DownloadRuntimeError(
              "E_EXECUTION_FAILED",
              "gallery-dl exited with code 1: extractor reported unsupported page",
            );
          },
        }),
        createEngine("yt-dlp"),
      ]),
    );

    const result = await orchestrator.execute(
      { url: "https://example.com/page/42" },
      createContext,
    );

    expect(result).toMatchObject({
      success: true,
      file_path: "/tmp/yt-dlp.mp4",
    });
  });
});
