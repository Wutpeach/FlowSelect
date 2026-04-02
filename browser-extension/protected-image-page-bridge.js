(function () {
  "use strict";

  const PAGE_REQUEST_TYPE = "FLOWSELECT_RESOLVE_PROTECTED_IMAGE_REQUEST";
  const PAGE_RESPONSE_TYPE = "FLOWSELECT_RESOLVE_PROTECTED_IMAGE_RESPONSE";
  const PAGE_BRIDGE_FLAG = "__flowselectProtectedImageBridgeInstalled";
  const PAGE_MESSAGE_SOURCE = "flowselect-protected-image-page";
  const EXTENSION_MESSAGE_SOURCE = "flowselect-protected-image-extension";

  if (window[PAGE_BRIDGE_FLAG]) {
    return;
  }
  window[PAGE_BRIDGE_FLAG] = true;

  function normalizeHttpUrl(raw) {
    if (typeof raw !== "string") {
      return null;
    }

    const trimmed = raw.trim();
    if (!trimmed) {
      return null;
    }

    try {
      const resolved = new URL(trimmed, window.location.href).toString();
      return /^https?:\/\//i.test(resolved) ? resolved : null;
    } catch (_) {
      return null;
    }
  }

  function deriveFilename(rawUrl) {
    const normalized = normalizeHttpUrl(rawUrl);
    if (!normalized) {
      return null;
    }
    try {
      const parsed = new URL(normalized);
      const rawName = parsed.pathname.split("/").filter(Boolean).pop() || "";
      return rawName ? decodeURIComponent(rawName) : null;
    } catch (_) {
      return null;
    }
  }

  function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : null);
      reader.onerror = () => reject(new Error("Failed to read protected image blob"));
      reader.readAsDataURL(blob);
    });
  }

  function findMatchingImage(imageUrl) {
    const normalizedUrl = normalizeHttpUrl(imageUrl);
    if (!normalizedUrl) {
      return null;
    }

    const images = Array.from(document.images || []);
    return images.find((image) => {
      const candidate =
        normalizeHttpUrl(image.currentSrc) ||
        normalizeHttpUrl(image.src) ||
        normalizeHttpUrl(image.getAttribute("src"));
      return candidate === normalizedUrl;
    }) || null;
  }

  function exportImageElement(image, imageUrl) {
    if (!(image instanceof HTMLImageElement) || !image.complete || !image.naturalWidth || !image.naturalHeight) {
      return null;
    }

    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext("2d");
    if (!context) {
      return null;
    }

    context.drawImage(image, 0, 0);
    return {
      dataUrl: canvas.toDataURL(),
      filename: deriveFilename(image.currentSrc || image.src || imageUrl),
    };
  }

  async function resolveProtectedImage(imageUrl) {
    const normalizedUrl = normalizeHttpUrl(imageUrl);
    if (!normalizedUrl) {
      return {
        success: false,
        code: "protected_image_invalid_url",
        error: "Invalid protected image URL",
      };
    }

    const matchingImage = findMatchingImage(normalizedUrl);
    if (matchingImage) {
      try {
        const exported = exportImageElement(matchingImage, normalizedUrl);
        if (exported && typeof exported.dataUrl === "string" && exported.dataUrl.startsWith("data:image/")) {
          return {
            success: true,
            dataUrl: exported.dataUrl,
            filename: exported.filename,
          };
        }
      } catch (_) {
        // Canvas export can fail on tainted images; continue to page fetch.
      }
    }

    try {
      const response = await fetch(normalizedUrl, {
        credentials: "include",
        cache: "force-cache",
      });

      if (!response.ok) {
        return {
          success: false,
          code: "protected_image_fetch_failed",
          error: "Protected image fetch failed with status " + response.status,
        };
      }

      const contentType = (response.headers.get("content-type") || "").toLowerCase();
      if (!contentType.startsWith("image/")) {
        return {
          success: false,
          code: "protected_image_non_image_response",
          error: "Protected image fetch returned non-image content",
        };
      }

      const blob = await response.blob();
      const dataUrl = await blobToDataUrl(blob);
      if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:image/")) {
        return {
          success: false,
          code: "protected_image_blob_encode_failed",
          error: "Protected image blob encoding failed",
        };
      }

      return {
        success: true,
        dataUrl,
        filename: deriveFilename(response.url || normalizedUrl),
      };
    } catch (error) {
      return {
        success: false,
        code: "protected_image_resolution_failed",
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  window.addEventListener("message", async (event) => {
    if (event.source !== window) {
      return;
    }

    const data = event.data;
    if (!data || data.source !== EXTENSION_MESSAGE_SOURCE || data.type !== PAGE_REQUEST_TYPE) {
      return;
    }

    const requestId = typeof data.requestId === "string" ? data.requestId : "";
    const pageUrl = normalizeHttpUrl(typeof data.pageUrl === "string" ? data.pageUrl : "");
    const currentPageUrl = normalizeHttpUrl(window.location.href);
    if (pageUrl && currentPageUrl && pageUrl !== currentPageUrl) {
      window.postMessage({
        source: PAGE_MESSAGE_SOURCE,
        type: PAGE_RESPONSE_TYPE,
        requestId,
        success: false,
        code: "protected_image_page_mismatch",
        error: "Protected image page context changed before fallback resolved",
      }, "*");
      return;
    }

    const result = await resolveProtectedImage(data.imageUrl);
    window.postMessage({
      source: PAGE_MESSAGE_SOURCE,
      type: PAGE_RESPONSE_TYPE,
      requestId,
      ...result,
    }, "*");
  });
})();
