import type { EngineExecutionContext } from "../core/index.js";
import type { NetworkRouteResolution } from "../config/networkRoute.js";
import type { NetworkApplicationOutcome } from "./engineNetworkAdapters.js";

/**
 * Narrowed per-engine static runtime dependencies. Concrete adapters receive
 * only the executables their runner actually consumes, injected through their
 * constructor; no engine sees the global resolved path set.
 */
export type YtDlpRuntimeDependencies = {
  ytDlp: string;
  ffmpeg: string;
  deno: string;
};

export type GalleryDlRuntimeDependencies = {
  galleryDl: string;
};

/** Shared media tools consumed explicitly by the transcode path. */
export type SharedMediaRuntimeTools = {
  ffmpeg: string;
  ffprobe: string;
};

/** Release the app-owned runtime set after the consuming process tree settles. */
export type RuntimeSetLease = {
  release(): void | Promise<void>;
};

/** Immutable yt-dlp paths and sanitized identity acquired for one attempt. */
export type YtDlpAttemptRuntimeBinding = {
  lease: RuntimeSetLease;
  binaries: YtDlpRuntimeDependencies;
  identity: {
    candidate: "bundled";
    runtimeSetId: string;
  };
};

/**
 * Explicit per-job engine execution contract (Infrastructure-side extension of
 * the application-owned context). The runtime service builds this per attempt:
 * it carries the P0 per-Job network resolution and the per-job callbacks that
 * only concrete adapters consume. Electron-neutral: no Electron API, binary
 * path, child-process value or CLI option appears here.
 *
 * Engines declare this exact type through the `DownloadEngine` port generic —
 * there is no hidden `as` widening; missing per-job fields are rejected at
 * compile time.
 */
export type EngineExecutionContextWithRuntime = EngineExecutionContext & {
  /**
   * The stable per-job network resolution. One resolution per queued Job,
   * reused across engine retry, engine fallback, and auth recovery. Engines
   * consume the route exclusively through their network adapters and never
   * re-resolve it.
   */
  network: NetworkRouteResolution;
  /**
   * Engine-specific execution data selected at the runtime boundary (a chosen
   * advanced-quality option). Infrastructure-owned: never part of the Domain
   * intent or the download protocol request.
   */
  advancedQualitySelector?: string;
  advancedQualityLabel?: string;
  /**
   * Reports the route application outcome for this engine attempt (applied or
   * rejected before spawn). The runtime uses it to attach the actual engine
   * and applied/not-applied result to per-download diagnostics; it never
   * re-resolves the route.
   */
  onNetworkApplication?(application: NetworkApplicationOutcome): void | Promise<void>;
  reportNetworkProxyFailure?(error: unknown): void | Promise<void>;
  /** Acquired atomically with runtime readiness by the Electron composition. */
  runtimeSetLease?: RuntimeSetLease;
  /** Present for yt-dlp attempts and probes; adapters execute these pinned paths. */
  ytDlpRuntimeBinding?: YtDlpAttemptRuntimeBinding;
};

/**
 * Adapter-composed engine invocation input: the per-job execution contract
 * plus the static runtime dependencies the engine implementation needs.
 * Adapters build this explicitly from their constructor-injected dependencies
 * and the declared per-job contract; engine runners consume it. No cast.
 */
export type EngineInvocationContext<TBinaries extends object> =
  EngineExecutionContextWithRuntime & {
    binaries: TBinaries;
  };
