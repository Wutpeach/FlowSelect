import { describe, expect, it, vi } from "vitest";

import { createExtensionRequestBridge } from "./extensionRequestBridge.mjs";

describe("createExtensionRequestBridge", () => {
  it("returns pending-request facts without broadcasting or opening a request", () => {
    const broadcast = vi.fn();
    const bridge = createExtensionRequestBridge({
      getConnectedClientCount: () => 1,
      broadcast,
      nextRequestId: () => "request-1",
    });

    expect(bridge.getDiagnosticsSnapshot()).toEqual({
      pendingPastedVideoSelectionRequests: 0,
      pendingSiteSessionCookieSyncRequests: 0,
    });
    expect(broadcast).not.toHaveBeenCalled();
  });

  it("broadcasts pasted selection requests and resolves correlated results", async () => {
    const broadcast = vi.fn();
    const bridge = createExtensionRequestBridge({
      getConnectedClientCount: () => 1,
      broadcast,
      nextRequestId: () => "request-1",
      timeoutMs: 1000,
    });

    const resolutionPromise = bridge.requestPastedVideoSelectionResolution({
      url: "https://www.youtube.com/watch?v=abc123",
      pageUrl: "https://www.youtube.com/watch?v=abc123",
      siteHint: "youtube",
    });

    expect(broadcast).toHaveBeenCalledWith({
      action: "resolve_pasted_video_selection",
      data: {
        requestId: "request-1",
        url: "https://www.youtube.com/watch?v=abc123",
        pageUrl: "https://www.youtube.com/watch?v=abc123",
        siteHint: "youtube",
      },
    });

    expect(bridge.handlePastedVideoSelectionResult({
      correlationRequestId: "request-1",
      success: true,
      url: "https://www.youtube.com/watch?v=abc123",
      pageUrl: "https://www.youtube.com/watch?v=abc123",
      title: "Example",
      videoQuality: "balanced",
    })).toEqual({
      success: true,
      message: "pasted_video_selection_received",
    });

    await expect(resolutionPromise).resolves.toMatchObject({
      success: true,
      url: "https://www.youtube.com/watch?v=abc123",
      pageUrl: "https://www.youtube.com/watch?v=abc123",
      title: "Example",
      videoQuality: "balanced",
    });
  });

  it("rejects pasted selection requests when no extension is connected", async () => {
    const bridge = createExtensionRequestBridge({
      getConnectedClientCount: () => 0,
      broadcast: vi.fn(),
      nextRequestId: () => "request-1",
      timeoutMs: 1000,
    });

    await expect(bridge.requestPastedVideoSelectionResolution({
      url: "https://www.youtube.com/watch?v=abc123",
      pageUrl: "https://www.youtube.com/watch?v=abc123",
      siteHint: "youtube",
    })).rejects.toThrow("Browser extension is not connected");
  });

  it("returns a failed acknowledgement for unknown pasted selection correlations", () => {
    const bridge = createExtensionRequestBridge({
      getConnectedClientCount: () => 1,
      broadcast: vi.fn(),
      nextRequestId: () => "request-1",
      timeoutMs: 1000,
    });

    expect(bridge.handlePastedVideoSelectionResult({
      correlationRequestId: "missing-request",
      success: true,
    })).toEqual({
      success: false,
      message: "Unknown pasted video correlation request",
      code: "unknown_correlation_request",
    });
  });

  it("rejects pending pasted selection requests during shutdown cleanup", async () => {
    const bridge = createExtensionRequestBridge({
      getConnectedClientCount: () => 1,
      broadcast: vi.fn(),
      nextRequestId: () => "request-1",
      timeoutMs: 1000,
    });

    const resolutionPromise = bridge.requestPastedVideoSelectionResolution({
      url: "https://www.youtube.com/watch?v=abc123",
      pageUrl: "https://www.youtube.com/watch?v=abc123",
      siteHint: "youtube",
    });

    bridge.rejectAllPendingRequests(new Error("Ameow is shutting down"));

    await expect(resolutionPromise).rejects.toThrow("Ameow is shutting down");
  });

  it("broadcasts site-session cookie sync requests and resolves the first correlated result", async () => {
    const broadcast = vi.fn();
    const bridge = createExtensionRequestBridge({
      getConnectedClientCount: () => 2,
      broadcast,
      nextRequestId: () => "sync-request-1",
      timeoutMs: 1000,
    });

    const resolutionPromise = bridge.requestSiteSessionCookieSync({
      siteId: "youtube",
      cookieDomains: ["youtube.com", "google.com"],
    });

    expect(broadcast).toHaveBeenCalledWith({
      action: "site_session_cookie_sync_request",
      data: {
        requestId: "sync-request-1",
        siteId: "youtube",
        cookieDomains: ["youtube.com", "google.com"],
      },
    });

    expect(bridge.handleSiteSessionCookieSyncResult({
      correlationRequestId: "sync-request-1",
      success: true,
      siteId: "youtube",
      source: {
        browser: "chrome",
        profileLabel: "Default",
        extensionId: "extension-id",
      },
      cookies: [
        {
          domain: ".youtube.com",
          name: "LOGIN_INFO",
          value: "login-info",
          path: "/",
          secure: true,
          httpOnly: true,
          expirationDate: 1_800_000_000,
        },
      ],
    })).toEqual({
      success: true,
      message: "site_session_cookie_sync_received",
    });

    expect(bridge.handleSiteSessionCookieSyncResult({
      correlationRequestId: "sync-request-1",
      success: true,
      siteId: "youtube",
      cookies: [],
    })).toEqual({
      success: false,
      message: "Unknown site session cookie sync correlation request",
      code: "unknown_correlation_request",
    });

    await expect(resolutionPromise).resolves.toMatchObject({
      success: true,
      siteId: "youtube",
      source: {
        browser: "chrome",
        profileLabel: "Default",
        extensionId: "extension-id",
      },
      cookies: [
        {
          domain: ".youtube.com",
          name: "LOGIN_INFO",
          value: "login-info",
          path: "/",
          secure: true,
          httpOnly: true,
          expirationDate: 1_800_000_000,
        },
      ],
    });
  });

  it("waits for a successful site-session cookie sync result when an earlier client fails", async () => {
    const bridge = createExtensionRequestBridge({
      getConnectedClientCount: () => 2,
      broadcast: vi.fn(),
      nextRequestId: () => "sync-request-1",
      timeoutMs: 1000,
    });

    const resolutionPromise = bridge.requestSiteSessionCookieSync({
      siteId: "youtube",
      cookieDomains: ["youtube.com", "google.com"],
    });

    expect(bridge.handleSiteSessionCookieSyncResult({
      correlationRequestId: "sync-request-1",
      success: false,
      siteId: "youtube",
      code: "no_site_session_cookies",
      error: "No supported site cookies were available.",
      cookies: [],
    })).toEqual({
      success: true,
      message: "site_session_cookie_sync_received",
    });

    expect(bridge.handleSiteSessionCookieSyncResult({
      correlationRequestId: "sync-request-1",
      success: true,
      siteId: "youtube",
      cookies: [
        {
          domain: ".youtube.com",
          name: "LOGIN_INFO",
          value: "login-info",
          path: "/",
        },
      ],
    })).toEqual({
      success: true,
      message: "site_session_cookie_sync_received",
    });

    await expect(resolutionPromise).resolves.toMatchObject({
      success: true,
      siteId: "youtube",
      cookies: [
        {
          domain: ".youtube.com",
          name: "LOGIN_INFO",
          value: "login-info",
          path: "/",
        },
      ],
    });
  });

  it("resolves site-session cookie sync failure after all connected clients fail", async () => {
    const bridge = createExtensionRequestBridge({
      getConnectedClientCount: () => 2,
      broadcast: vi.fn(),
      nextRequestId: () => "sync-request-1",
      timeoutMs: 1000,
    });

    const resolutionPromise = bridge.requestSiteSessionCookieSync({
      siteId: "youtube",
      cookieDomains: ["youtube.com", "google.com"],
    });

    bridge.handleSiteSessionCookieSyncResult({
      correlationRequestId: "sync-request-1",
      success: false,
      siteId: "youtube",
      code: "no_site_session_cookies",
      error: "First profile is not logged in.",
      cookies: [],
    });
    bridge.handleSiteSessionCookieSyncResult({
      correlationRequestId: "sync-request-1",
      success: false,
      siteId: "youtube",
      code: "no_site_session_cookies",
      error: "Second profile is not logged in.",
      cookies: [],
    });

    await expect(resolutionPromise).resolves.toMatchObject({
      success: false,
      siteId: "youtube",
      code: "no_site_session_cookies",
      error: "Second profile is not logged in.",
      cookies: [],
    });
  });

  it("rejects site-session cookie sync requests when no extension is connected", async () => {
    const bridge = createExtensionRequestBridge({
      getConnectedClientCount: () => 0,
      broadcast: vi.fn(),
      nextRequestId: () => "sync-request-1",
      timeoutMs: 1000,
    });

    await expect(bridge.requestSiteSessionCookieSync({
      siteId: "youtube",
      cookieDomains: ["youtube.com", "google.com"],
    })).rejects.toThrow("Browser extension is not connected");
  });
});
