import {
  normalizeRequiredVideoRouteUrl,
  normalizeVideoCandidates,
  normalizeVideoHintUrl,
  normalizeVideoPageUrl,
  resolveVideoSelectionSiteHint,
} from "./videoHintNormalization.mjs";
import { normalizeVideoQualityPreference } from "../src/core/index.js";

export type PastedVideoSelectionRequest = {
  url: string;
  pageUrl?: string | null;
  siteHint?: string | null;
};

export type PastedVideoSelectionResolution = {
  success: boolean;
  url?: string;
  pageUrl?: string;
  videoUrl?: string;
  videoCandidates: Array<{
    url: string;
    type?: string;
    source?: string;
    confidence?: string;
    mediaType?: "video" | "image";
  }>;
  siteHint?: string;
  title?: string;
  selectionScope?: "current_item" | "playlist";
  clipStartSec?: number;
  clipEndSec?: number;
  videoQuality?: "best" | "balanced" | "data_saver";
  extensionData?: Record<string, unknown>;
  code?: string;
  error?: string;
};

export type SiteSessionCookieSyncRequest = {
  siteId: string;
  cookieDomains: string[];
};

export type SiteSessionCookieRecord = {
  domain?: string;
  expirationDate?: number;
  httpOnly?: boolean;
  name?: string;
  path?: string;
  secure?: boolean;
  value?: string;
};

export type SiteSessionCookieSyncSource = {
  browser?: string;
  profileLabel?: string;
  extensionId?: string;
};

export type SiteSessionCookieSyncResolution = {
  success: boolean;
  siteId?: string;
  cookies: SiteSessionCookieRecord[];
  source?: SiteSessionCookieSyncSource;
  code?: string;
  error?: string;
};

export type ExtensionRequestBridge = {
  getDiagnosticsSnapshot(): {
    pendingPastedVideoSelectionRequests: number;
    pendingSiteSessionCookieSyncRequests: number;
  };
  requestPastedVideoSelectionResolution(
    payload: PastedVideoSelectionRequest,
  ): Promise<PastedVideoSelectionResolution>;
  requestSiteSessionCookieSync(
    payload: SiteSessionCookieSyncRequest,
  ): Promise<SiteSessionCookieSyncResolution>;
  handlePastedVideoSelectionResult(data: unknown): {
    success: boolean;
    message: string;
    code?: string;
  };
  handleSiteSessionCookieSyncResult(data: unknown): {
    success: boolean;
    message: string;
    code?: string;
  };
  rejectAllPendingRequests(error: Error): void;
};

type PendingResolution<TResult> = {
  resolveResolution: (resolution: TResult) => void;
  rejectResolution: (error: Error) => void;
  timeoutId: ReturnType<typeof setTimeout>;
};

type PendingSiteSessionCookieSyncResolution = PendingResolution<SiteSessionCookieSyncResolution> & {
  expectedResponseCount: number;
  failedResponseCount: number;
  lastFailure: SiteSessionCookieSyncResolution | null;
};

export type ExtensionRequestBridgeOptions = {
  getConnectedClientCount(): number;
  broadcast(message: unknown): void;
  nextRequestId(prefix: string): string;
  timeoutMs?: number;
  log?(message: string, details?: unknown): void;
};

const DEFAULT_PASTED_VIDEO_SELECTION_TIMEOUT_MS = 20_000;

const normalizeOptionalString = (value: unknown): string | undefined => {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed || undefined;
};

const normalizeOptionalNumber = (value: unknown): number | undefined => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : undefined;
};

const asObject = (value: unknown): Record<string, unknown> | null => (
  value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
);

const normalizeSelectionScope = (
  value: unknown,
): "current_item" | "playlist" | undefined => (
  value === "current_item" || value === "playlist" ? value : undefined
);

export const createExtensionRequestBridge = (
  options: ExtensionRequestBridgeOptions,
): ExtensionRequestBridge => {
  const pendingPastedVideoSelectionRequests = new Map<string, PendingResolution<PastedVideoSelectionResolution>>();
  const pendingSiteSessionCookieSyncRequests = new Map<string, PendingSiteSessionCookieSyncResolution>();
  const timeoutMs = options.timeoutMs ?? DEFAULT_PASTED_VIDEO_SELECTION_TIMEOUT_MS;

  const takePendingPastedVideoSelectionRequest = (requestId: string): PendingResolution<PastedVideoSelectionResolution> | null => {
    const pending = pendingPastedVideoSelectionRequests.get(requestId);
    if (!pending) {
      return null;
    }
    pendingPastedVideoSelectionRequests.delete(requestId);
    clearTimeout(pending.timeoutId);
    return pending;
  };

  const takePendingSiteSessionCookieSyncRequest = (requestId: string): PendingSiteSessionCookieSyncResolution | null => {
    const pending = pendingSiteSessionCookieSyncRequests.get(requestId);
    if (!pending) {
      return null;
    }
    pendingSiteSessionCookieSyncRequests.delete(requestId);
    clearTimeout(pending.timeoutId);
    return pending;
  };

  return {
    getDiagnosticsSnapshot() {
      return {
        pendingPastedVideoSelectionRequests: pendingPastedVideoSelectionRequests.size,
        pendingSiteSessionCookieSyncRequests: pendingSiteSessionCookieSyncRequests.size,
      };
    },
    async requestPastedVideoSelectionResolution(payload) {
      if (options.getConnectedClientCount() === 0) {
        throw new Error("Browser extension is not connected");
      }

      const requestId = options.nextRequestId("pasted-video-selection");
      options.log?.("Requesting extension-assisted video selection", {
        requestId,
        url: payload.url,
        siteHint: payload.siteHint ?? null,
        pageUrl: payload.pageUrl ?? null,
        wsClientCount: options.getConnectedClientCount(),
      });

      return await new Promise<PastedVideoSelectionResolution>((resolveResolution, rejectResolution) => {
        const timeoutId = setTimeout(() => {
          pendingPastedVideoSelectionRequests.delete(requestId);
          rejectResolution(new Error("Pasted video selection resolution timed out"));
        }, timeoutMs);

        pendingPastedVideoSelectionRequests.set(requestId, {
          resolveResolution,
          rejectResolution,
          timeoutId,
        });

        options.broadcast({
          action: "resolve_pasted_video_selection",
          data: {
            requestId,
            url: payload.url,
            pageUrl: payload.pageUrl ?? null,
            siteHint: payload.siteHint ?? null,
          },
        });
      });
    },

    async requestSiteSessionCookieSync(payload) {
      const connectedClientCount = options.getConnectedClientCount();
      if (connectedClientCount === 0) {
        throw new Error("Browser extension is not connected");
      }

      const requestId = options.nextRequestId("site-session-cookie-sync");
      options.log?.("Requesting extension site-session cookie sync", {
        requestId,
        siteId: payload.siteId,
        cookieDomains: payload.cookieDomains,
        wsClientCount: connectedClientCount,
      });

      return await new Promise<SiteSessionCookieSyncResolution>((resolveResolution, rejectResolution) => {
        const timeoutId = setTimeout(() => {
          pendingSiteSessionCookieSyncRequests.delete(requestId);
          rejectResolution(new Error("Site session cookie sync timed out"));
        }, timeoutMs);

        pendingSiteSessionCookieSyncRequests.set(requestId, {
          resolveResolution,
          rejectResolution,
          timeoutId,
          expectedResponseCount: Math.max(1, connectedClientCount),
          failedResponseCount: 0,
          lastFailure: null,
        });

        options.broadcast({
          action: "site_session_cookie_sync_request",
          data: {
            requestId,
            siteId: payload.siteId,
            cookieDomains: payload.cookieDomains,
          },
        });
      });
    },

    handlePastedVideoSelectionResult(data) {
      const payload = asObject(data);
      const correlationRequestId = normalizeOptionalString(
        payload?.correlationRequestId ?? payload?.correlation_request_id,
      );
      if (!correlationRequestId) {
        return {
          success: false,
          message: "Missing correlationRequestId",
          code: "missing_correlation_request_id",
        };
      }

      const pending = takePendingPastedVideoSelectionRequest(correlationRequestId);
      if (!pending) {
        return {
          success: false,
          message: "Unknown pasted video correlation request",
          code: "unknown_correlation_request",
        };
      }

      const siteHint = resolveVideoSelectionSiteHint(
        payload?.siteHint,
        payload?.pageUrl,
        payload?.url,
        payload?.videoUrl,
      );
      const rawExtensionData = asObject(payload?.extensionData) ?? asObject(payload?.extension_data) ?? undefined;

      pending.resolveResolution({
        success: payload?.success === true,
        url: normalizeRequiredVideoRouteUrl(payload?.url),
        pageUrl: normalizeVideoPageUrl(payload?.pageUrl),
        videoUrl: normalizeVideoHintUrl(payload?.videoUrl, siteHint),
        videoCandidates: Array.isArray(payload?.videoCandidates ?? payload?.video_candidates)
          ? normalizeVideoCandidates(payload?.videoCandidates ?? payload?.video_candidates, siteHint)
          : [],
        siteHint,
        title: normalizeOptionalString(payload?.title),
        selectionScope: normalizeSelectionScope(payload?.selectionScope),
        clipStartSec: normalizeOptionalNumber(payload?.clipStartSec ?? payload?.clip_start_sec),
        clipEndSec: normalizeOptionalNumber(payload?.clipEndSec ?? payload?.clip_end_sec),
        videoQuality:
          normalizeVideoQualityPreference(payload?.videoQuality)
          ?? normalizeVideoQualityPreference(payload?.ytdlpQuality),
        extensionData: rawExtensionData,
        code: normalizeOptionalString(payload?.code),
        error: normalizeOptionalString(payload?.error),
      });

      return {
        success: true,
        message: "pasted_video_selection_received",
      };
    },

    handleSiteSessionCookieSyncResult(data) {
      const payload = asObject(data);
      const correlationRequestId = normalizeOptionalString(
        payload?.correlationRequestId ?? payload?.correlation_request_id,
      );
      if (!correlationRequestId) {
        return {
          success: false,
          message: "Missing correlationRequestId",
          code: "missing_correlation_request_id",
        };
      }

      const pending = pendingSiteSessionCookieSyncRequests.get(correlationRequestId);
      if (!pending) {
        return {
          success: false,
          message: "Unknown site session cookie sync correlation request",
          code: "unknown_correlation_request",
        };
      }

      const rawCookies = Array.isArray(payload?.cookies) ? payload.cookies : [];
      const source = asObject(payload?.source);
      const resolution = {
        success: payload?.success === true,
        siteId: normalizeOptionalString(payload?.siteId ?? payload?.site_id),
        cookies: rawCookies
          .map((cookie) => asObject(cookie))
          .filter((cookie): cookie is Record<string, unknown> => cookie !== null)
          .map((cookie) => ({
            domain: normalizeOptionalString(cookie.domain),
            expirationDate: normalizeOptionalNumber(cookie.expirationDate ?? cookie.expiration_date),
            httpOnly: cookie.httpOnly === true || cookie.http_only === true,
            name: normalizeOptionalString(cookie.name),
            path: normalizeOptionalString(cookie.path),
            secure: cookie.secure === true,
            value: normalizeOptionalString(cookie.value),
          })),
        source: source
          ? {
              browser: normalizeOptionalString(source.browser),
              profileLabel: normalizeOptionalString(source.profileLabel ?? source.profile_label),
              extensionId: normalizeOptionalString(source.extensionId ?? source.extension_id),
            }
          : undefined,
        code: normalizeOptionalString(payload?.code),
        error: normalizeOptionalString(payload?.error),
      };

      if (resolution.success) {
        takePendingSiteSessionCookieSyncRequest(correlationRequestId)?.resolveResolution(resolution);
      } else {
        pending.failedResponseCount += 1;
        pending.lastFailure = resolution;
        if (pending.failedResponseCount >= pending.expectedResponseCount) {
          takePendingSiteSessionCookieSyncRequest(correlationRequestId)?.resolveResolution(resolution);
        }
      }

      return {
        success: true,
        message: "site_session_cookie_sync_received",
      };
    },

    rejectAllPendingRequests(error) {
      for (const pending of pendingPastedVideoSelectionRequests.values()) {
        clearTimeout(pending.timeoutId);
        pending.rejectResolution(error);
      }
      pendingPastedVideoSelectionRequests.clear();
      for (const pending of pendingSiteSessionCookieSyncRequests.values()) {
        clearTimeout(pending.timeoutId);
        pending.rejectResolution(error);
      }
      pendingSiteSessionCookieSyncRequests.clear();
    },
  };
};
