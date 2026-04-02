(function () {
  "use strict";

  const DRAG_PAYLOAD_MARKER = "FLOWSELECT_PROTECTED_IMAGE_DRAG";
  const DRAG_PAYLOAD_MIME = "application/x-flowselect-protected-image-drag";
  const PAGE_REQUEST_TYPE = "FLOWSELECT_RESOLVE_PROTECTED_IMAGE_REQUEST";
  const PAGE_RESPONSE_TYPE = "FLOWSELECT_RESOLVE_PROTECTED_IMAGE_RESPONSE";
  const PAGE_BRIDGE_FLAG = "__flowselectProtectedImageBridgeInstalled";
  const PAGE_MESSAGE_SOURCE = "flowselect-protected-image-page";
  const EXTENSION_MESSAGE_SOURCE = "flowselect-protected-image-extension";
  const PAGE_RESPONSE_TIMEOUT_MS = 12000;
  const PAGE_BRIDGE_SCRIPT_PATH = "protected-image-page-bridge.js";
  const EXCLUDED_HOST_RE =
    /(^|\.)pinterest\.com$|(^|\.)youtube\.com$|(^|\.)bilibili\.com$|(^|\.)douyin\.com$|(^|\.)xiaohongshu\.com$|(^|\.)xhslink\.com$|(^|\.)twitter\.com$|(^|\.)x\.com$/i;

  let pageRequestCounter = 0;
  let pageBridgeInjected = false;
  let pageBridgeInjectionPromise = null;

  function shouldSkipPage() {
    return EXCLUDED_HOST_RE.test(window.location.hostname || "");
  }

  function normalizeHttpUrl(raw) {
    if (typeof raw !== "string") {
      return null;
    }

    const trimmed = raw.trim();
    if (!trimmed || /^data:/i.test(trimmed) || /^blob:/i.test(trimmed) || /^file:/i.test(trimmed)) {
      return null;
    }

    try {
      const resolved = new URL(trimmed, window.location.href).toString();
      return /^https?:\/\//i.test(resolved) ? resolved : null;
    } catch (_) {
      return null;
    }
  }

  function encodeUtf8Base64(value) {
    try {
      return btoa(
        encodeURIComponent(value).replace(/%([0-9A-F]{2})/gi, (_, hex) =>
          String.fromCharCode(Number.parseInt(hex, 16)),
        ),
      );
    } catch (_) {
      return "";
    }
  }

  function buildPayloadText(payload) {
    const encoded = encodeUtf8Base64(JSON.stringify(payload));
    return encoded ? `${DRAG_PAYLOAD_MARKER}:${encoded}` : "";
  }

  function nextToken() {
    if (globalThis.crypto && typeof globalThis.crypto.randomUUID === "function") {
      return globalThis.crypto.randomUUID();
    }
    return `flowselect-img-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }

  function resolveImageElement(target) {
    if (target instanceof HTMLImageElement) {
      return target;
    }

    if (!(target instanceof Element)) {
      return null;
    }

    const direct = target.closest("img");
    return direct instanceof HTMLImageElement ? direct : null;
  }

  function looksLikeImageUrl(url) {
    return /(?:^data:image\/)|(?:\.(?:avif|bmp|gif|jpe?g|png|svg|webp)(?:[?#]|$))|(?:sinaimg\.cn\/)/i.test(
      url,
    );
  }

  function resolveImageUrlCandidate(raw) {
    const normalized = normalizeHttpUrl(raw);
    return normalized && looksLikeImageUrl(normalized) ? normalized : null;
  }

  function extractCssImageUrl(value) {
    if (typeof value !== "string" || !value.trim()) {
      return null;
    }

    for (const match of value.matchAll(/url\((?:"([^"]+)"|'([^']+)'|([^)"']+))\)/gi)) {
      const candidate = resolveImageUrlCandidate(match[1] || match[2] || match[3]);
      if (candidate) {
        return candidate;
      }
    }

    return null;
  }

  function resolveImageUrlFromElement(element) {
    if (!(element instanceof Element)) {
      return null;
    }

    if (element instanceof HTMLImageElement) {
      return (
        resolveImageUrlCandidate(element.currentSrc) ||
        resolveImageUrlCandidate(element.src) ||
        resolveImageUrlCandidate(element.getAttribute("src")) ||
        null
      );
    }

    for (const attribute of [
      "data-image-url",
      "data-image",
      "data-src",
      "data-url",
      "src",
      "href",
    ]) {
      const candidate = resolveImageUrlCandidate(element.getAttribute(attribute));
      if (candidate) {
        return candidate;
      }
    }

    const inlineBackground = extractCssImageUrl(element.getAttribute("style"));
    if (inlineBackground) {
      return inlineBackground;
    }

    if (typeof window.getComputedStyle === "function") {
      const computedBackground = extractCssImageUrl(window.getComputedStyle(element).backgroundImage);
      if (computedBackground) {
        return computedBackground;
      }
    }

    return null;
  }

  function findImageUrlInElementSubtree(element) {
    if (!(element instanceof Element)) {
      return null;
    }

    const nestedImage = element.querySelector("img");
    if (nestedImage instanceof HTMLImageElement) {
      const nestedImageUrl =
        resolveImageUrlCandidate(nestedImage.currentSrc) ||
        resolveImageUrlCandidate(nestedImage.src) ||
        resolveImageUrlCandidate(nestedImage.getAttribute("src"));
      if (nestedImageUrl) {
        return nestedImageUrl;
      }
    }

    const styledNode = element.querySelector("[style*='background-image'], [data-image], [data-image-url], [data-src]");
    if (styledNode instanceof Element) {
      return resolveImageUrlFromElement(styledNode);
    }

    return null;
  }

  function resolveDraggedImageUrl(image, target) {
    if (image instanceof HTMLImageElement) {
      const directUrl =
        resolveImageUrlCandidate(image.currentSrc) ||
        resolveImageUrlCandidate(image.src) ||
        resolveImageUrlCandidate(image.getAttribute("src"));
      if (directUrl) {
        return directUrl;
      }
    }

    if (!(target instanceof Element)) {
      return null;
    }

    let current = target;
    let depth = 0;

    while (current && depth < 5) {
      const elementUrl = resolveImageUrlFromElement(current);
      if (elementUrl) {
        return elementUrl;
      }

      const subtreeUrl = findImageUrlInElementSubtree(current);
      if (subtreeUrl) {
        return subtreeUrl;
      }

      current = current.parentElement;
      depth += 1;
    }

    return null;
  }

  function deriveFilenameFromUrl(rawUrl) {
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
      filename: deriveFilenameFromUrl(image.currentSrc || image.src || imageUrl),
    };
  }

  async function fetchProtectedImageInContentScript(imageUrl) {
    const normalizedUrl = normalizeHttpUrl(imageUrl);
    if (!normalizedUrl) {
      return {
        success: false,
        code: "protected_image_invalid_url",
        error: "Invalid protected image URL",
      };
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
          error: `Protected image fetch failed with status ${response.status}`,
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
        filename: deriveFilenameFromUrl(response.url || normalizedUrl),
      };
    } catch (error) {
      return {
        success: false,
        code: "protected_image_resolution_failed",
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async function resolveProtectedImageInContentScript(imageUrl) {
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
      } catch (error) {
        console.warn("[FlowSelect] Protected image canvas export failed, falling back to fetch:", error);
      }
    }

    return await fetchProtectedImageInContentScript(normalizedUrl);
  }

  function registerProtectedImageDrag(payload) {
    chrome.runtime.sendMessage({
      type: "register_protected_image_drag",
      token: payload.token,
      pageUrl: payload.pageUrl,
      imageUrl: payload.imageUrl,
    }).catch((error) => {
      console.warn("[FlowSelect] Failed to register protected image drag:", error);
    });
  }

  function injectPageBridge() {
    if (pageBridgeInjected) {
      return Promise.resolve();
    }

    if (pageBridgeInjectionPromise) {
      return pageBridgeInjectionPromise;
    }

    pageBridgeInjectionPromise = new Promise((resolve, reject) => {
      const parent = document.documentElement || document.head || document.body;
      if (!parent) {
        reject(new Error("Protected image page bridge injection target was not available"));
        return;
      }

      const script = document.createElement("script");
      script.src = chrome.runtime.getURL(PAGE_BRIDGE_SCRIPT_PATH);
      script.async = false;

      script.onload = () => {
        script.remove();
        pageBridgeInjected = true;
        pageBridgeInjectionPromise = null;
        resolve();
      };

      script.onerror = () => {
        script.remove();
        pageBridgeInjectionPromise = null;
        reject(new Error("Protected image page bridge failed to load"));
      };

      parent.appendChild(script);
    });

    return pageBridgeInjectionPromise;
  }

  function nextPageRequestId() {
    pageRequestCounter += 1;
    return `protected-image-${Date.now()}-${pageRequestCounter}`;
  }

  async function resolveProtectedImageFromPage(imageUrl, pageUrl) {
    try {
      await injectPageBridge();
    } catch (error) {
      return {
        success: false,
        code: "protected_image_page_bridge_injection_failed",
        error: error instanceof Error ? error.message : String(error),
      };
    }

    return new Promise((resolve) => {
      const requestId = nextPageRequestId();
      const timeout = window.setTimeout(() => {
        window.removeEventListener("message", handleMessage);
        resolve({
          success: false,
          code: "protected_image_resolution_timeout",
          error: "Protected image resolution timed out",
        });
      }, PAGE_RESPONSE_TIMEOUT_MS);

      function handleMessage(event) {
        if (event.source !== window) {
          return;
        }

        const data = event.data;
        if (
          !data ||
          data.source !== PAGE_MESSAGE_SOURCE ||
          data.type !== PAGE_RESPONSE_TYPE ||
          data.requestId !== requestId
        ) {
          return;
        }

        clearTimeout(timeout);
        window.removeEventListener("message", handleMessage);
        resolve(data);
      }

      window.addEventListener("message", handleMessage);
      window.postMessage(
        {
          source: EXTENSION_MESSAGE_SOURCE,
          type: PAGE_REQUEST_TYPE,
          requestId,
          imageUrl,
          pageUrl,
        },
        "*",
      );
    });
  }

  function handleDragStart(event) {
    if (shouldSkipPage() || !(event instanceof DragEvent) || !event.dataTransfer) {
      return;
    }

    const image = resolveImageElement(event.target);
    const imageUrl = resolveDraggedImageUrl(image, event.target);
    if (!imageUrl) {
      return;
    }

    const payload = {
      kind: "protected_image",
      token: nextToken(),
      pageUrl: window.location.href,
      imageUrl,
    };
    const payloadText = buildPayloadText(payload);
    if (!payloadText) {
      return;
    }

    registerProtectedImageDrag(payload);
    event.dataTransfer.setData("text/plain", `${imageUrl}\n${payloadText}`);
    event.dataTransfer.setData("text/uri-list", imageUrl);
    event.dataTransfer.setData(DRAG_PAYLOAD_MIME, payloadText);
  }

  async function handleProtectedImageResolveMessage(message) {
    const imageUrl = normalizeHttpUrl(message?.imageUrl);
    const pageUrl = normalizeHttpUrl(message?.pageUrl);
    if (!imageUrl) {
      return {
        success: false,
        code: "protected_image_invalid_url",
        error: "Missing protected image URL",
      };
    }

    const localResult = await resolveProtectedImageInContentScript(imageUrl);
    if (localResult?.success) {
      console.info("[FlowSelect] Protected image resolved in content script context");
      return localResult;
    }

    console.warn(
      "[FlowSelect] Protected image local resolution failed, trying page bridge:",
      localResult?.code || localResult?.error || "unknown",
    );

    const pageResult = await resolveProtectedImageFromPage(imageUrl, pageUrl || window.location.href);
    if (pageResult?.success) {
      console.info("[FlowSelect] Protected image resolved through page bridge");
      return pageResult;
    }

    return {
      success: false,
      code: pageResult?.code || localResult?.code || "protected_image_resolution_failed",
      error: pageResult?.error || localResult?.error || "Protected image resolution failed",
    };
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type !== "resolve_protected_image") {
      return true;
    }

    void handleProtectedImageResolveMessage(message)
      .then((result) => {
        sendResponse(result);
      })
      .catch((error) => {
        sendResponse({
          success: false,
          code: "protected_image_resolution_failed",
          error: error instanceof Error ? error.message : String(error),
        });
      });

    return true;
  });

  document.addEventListener("dragstart", handleDragStart, true);
})();
