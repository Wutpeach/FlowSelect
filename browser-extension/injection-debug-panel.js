(function initFlowSelectInjectionDebugPanel(root) {
  "use strict";

  const PANEL_ID = "flowselect-injection-debug-panel";
  const PANEL_POSITION_KEY = "flowselectInjectionDebugPanelPosition";
  const PANEL_SIZE_KEY = "flowselectInjectionDebugPanelSize";
  const OVERRIDES_PREFIX = "flowselectInjectionDebugOverrides:";
  const SNAPSHOT_REFRESH_MS = 280;
  const DEFAULT_PANEL_WIDTH_PX = 312;
  const DEFAULT_PANEL_HEIGHT_PX = 208;
  const DEFAULT_PANEL_OFFSET_X_PX = 328;
  const DEFAULT_DIAGNOSTICS_HEIGHT_PX = 168;

  let panel = null;
  let activeAdapter = null;
  let refreshTimer = null;
  let dragState = null;
  let currentPosition = null;
  let currentSize = null;
  let controlInputs = new Map();
  let diagnosticsCollapsed = true;

  function storageGet(key) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.get(key, (result) => {
        if (chrome.runtime?.lastError) {
          reject(chrome.runtime.lastError);
          return;
        }
        resolve(result);
      });
    });
  }

  function storageSet(payload) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.set(payload, () => {
        if (chrome.runtime?.lastError) {
          reject(chrome.runtime.lastError);
          return;
        }
        resolve();
      });
    });
  }

  function createPanelElement() {
    const container = document.createElement("aside");
    container.id = PANEL_ID;
    container.style.position = "fixed";
    container.style.top = "16px";
    container.style.right = "16px";
    container.style.width = `${DEFAULT_PANEL_WIDTH_PX}px`;
    container.style.minWidth = "248px";
    container.style.minHeight = "116px";
    container.style.maxWidth = "min(380px, calc(100vw - 24px))";
    container.style.maxHeight = "min(420px, calc(100vh - 24px))";
    container.style.zIndex = "2147483647";
    container.style.border = "1px solid rgba(255,255,255,0.12)";
    container.style.borderRadius = "14px";
    container.style.background = "rgba(16,16,20,0.94)";
    container.style.backdropFilter = "blur(14px)";
    container.style.boxShadow = "0 16px 42px rgba(0,0,0,0.34)";
    container.style.color = "#f3f4f6";
    container.style.fontFamily = "'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace";
    container.style.fontSize = "12px";
    container.style.lineHeight = "1.45";
    container.style.display = "grid";
    container.style.gridTemplateRows = "auto auto auto";
    container.style.overflow = "hidden";
    container.style.resize = "both";

    const header = document.createElement("div");
    header.style.display = "flex";
    header.style.alignItems = "center";
    header.style.justifyContent = "space-between";
    header.style.gap = "10px";
    header.style.padding = "10px 12px";
    header.style.borderBottom = "1px solid rgba(255,255,255,0.08)";
    header.style.background = "rgba(255,255,255,0.03)";
    header.style.cursor = "move";

    const titleWrap = document.createElement("div");
    titleWrap.style.display = "grid";
    titleWrap.style.gap = "2px";

    const title = document.createElement("div");
    title.dataset.role = "title";
    title.style.fontSize = "12px";
    title.style.fontWeight = "700";
    title.style.letterSpacing = "0.02em";

    const subtitle = document.createElement("div");
    subtitle.dataset.role = "subtitle";
    subtitle.style.fontSize = "11px";
    subtitle.style.opacity = "0.72";

    titleWrap.appendChild(title);
    titleWrap.appendChild(subtitle);

    const actionRow = document.createElement("div");
    actionRow.style.display = "flex";
    actionRow.style.alignItems = "center";
    actionRow.style.gap = "6px";

    const makeHeaderButton = (label, role) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = label;
      button.dataset.role = role;
      button.style.border = "1px solid rgba(255,255,255,0.12)";
      button.style.borderRadius = "999px";
      button.style.padding = "4px 8px";
      button.style.background = "rgba(255,255,255,0.04)";
      button.style.color = "inherit";
      button.style.cursor = "pointer";
      button.style.font = "inherit";
      return button;
    };

    actionRow.appendChild(makeHeaderButton("Copy Params", "copy-params"));
    actionRow.appendChild(makeHeaderButton("Copy Debug", "copy-debug"));
    actionRow.appendChild(makeHeaderButton("Details", "toggle-details"));
    actionRow.appendChild(makeHeaderButton("Reset", "reset"));

    header.appendChild(titleWrap);
    header.appendChild(actionRow);

    const controls = document.createElement("div");
    controls.dataset.role = "controls";
    controls.style.display = "grid";
    controls.style.gridTemplateColumns = "repeat(2, minmax(0, 1fr))";
    controls.style.gap = "8px";
    controls.style.padding = "12px";
    controls.style.borderBottom = "1px solid rgba(255,255,255,0.06)";

    const body = document.createElement("div");
    body.dataset.role = "body";
    body.style.display = "grid";
    body.style.gap = "8px";
    body.style.padding = "10px 12px 12px";
    body.style.minHeight = "0";
    body.style.maxHeight = `${DEFAULT_DIAGNOSTICS_HEIGHT_PX}px`;
    body.style.overflow = "hidden";

    const diagnostics = document.createElement("textarea");
    diagnostics.dataset.role = "diagnostics";
    diagnostics.readOnly = true;
    diagnostics.spellcheck = false;
    diagnostics.style.width = "100%";
    diagnostics.style.minHeight = "112px";
    diagnostics.style.height = `${DEFAULT_DIAGNOSTICS_HEIGHT_PX}px`;
    diagnostics.style.maxHeight = `${DEFAULT_DIAGNOSTICS_HEIGHT_PX}px`;
    diagnostics.style.resize = "none";
    diagnostics.style.border = "1px solid rgba(255,255,255,0.1)";
    diagnostics.style.borderRadius = "10px";
    diagnostics.style.padding = "10px";
    diagnostics.style.background = "rgba(255,255,255,0.03)";
    diagnostics.style.color = "inherit";
    diagnostics.style.font = "inherit";
    diagnostics.style.boxSizing = "border-box";
    diagnostics.style.overflow = "auto";

    body.appendChild(diagnostics);

    container.appendChild(header);
    container.appendChild(controls);
    container.appendChild(body);

    return {
      container,
      controls,
      diagnostics,
      title,
      subtitle,
      header,
      body,
      copyParamsButton: actionRow.querySelector('[data-role="copy-params"]'),
      copyDebugButton: actionRow.querySelector('[data-role="copy-debug"]'),
      toggleDetailsButton: actionRow.querySelector('[data-role="toggle-details"]'),
      resetButton: actionRow.querySelector('[data-role="reset"]'),
    };
  }

  function clampPosition(position) {
    const width = currentSize?.width ?? panel?.container.getBoundingClientRect().width ?? DEFAULT_PANEL_WIDTH_PX;
    const height = currentSize?.height ?? panel?.container.getBoundingClientRect().height ?? DEFAULT_PANEL_HEIGHT_PX;
    return {
      x: Math.max(8, Math.min(window.innerWidth - width - 8, position.x)),
      y: Math.max(8, Math.min(window.innerHeight - height - 8, position.y)),
    };
  }

  function applyDiagnosticsVisibility() {
    if (!panel) {
      return;
    }

    panel.body.style.display = diagnosticsCollapsed ? "none" : "grid";
    if (panel.toggleDetailsButton instanceof HTMLButtonElement) {
      panel.toggleDetailsButton.textContent = diagnosticsCollapsed ? "Details" : "Hide";
    }
  }

  function applyPanelBounds() {
    if (!panel) {
      return;
    }

    const nextPosition = clampPosition(currentPosition ?? {
      x: window.innerWidth - DEFAULT_PANEL_OFFSET_X_PX,
      y: 16,
    });
    currentPosition = nextPosition;
    panel.container.style.left = `${nextPosition.x}px`;
    panel.container.style.top = `${nextPosition.y}px`;
    panel.container.style.right = "auto";

    if (currentSize?.width) {
      panel.container.style.width = `${currentSize.width}px`;
    }
    if (currentSize?.height && !diagnosticsCollapsed) {
      panel.container.style.height = `${currentSize.height}px`;
    } else {
      panel.container.style.removeProperty("height");
    }
  }

  async function loadPersistedPanelState() {
    try {
      const result = await storageGet([PANEL_POSITION_KEY, PANEL_SIZE_KEY]);
      const position = result?.[PANEL_POSITION_KEY];
      const size = result?.[PANEL_SIZE_KEY];
      if (position && typeof position.x === "number" && typeof position.y === "number") {
        currentPosition = position;
      }
      if (size && typeof size.width === "number" && typeof size.height === "number") {
        currentSize = size;
      }
    } catch (error) {
      console.error("[FlowSelect] Failed to load injection debug panel state:", error);
    }
  }

  async function persistPanelPosition() {
    if (!currentPosition) {
      return;
    }
    try {
      await storageSet({ [PANEL_POSITION_KEY]: currentPosition });
    } catch (error) {
      console.error("[FlowSelect] Failed to persist injection debug panel position:", error);
    }
  }

  async function persistPanelSize() {
    if (!currentSize) {
      return;
    }
    try {
      await storageSet({ [PANEL_SIZE_KEY]: currentSize });
    } catch (error) {
      console.error("[FlowSelect] Failed to persist injection debug panel size:", error);
    }
  }

  function stopRefreshLoop() {
    if (refreshTimer !== null) {
      clearInterval(refreshTimer);
      refreshTimer = null;
    }
  }

  function renderDiagnostics() {
    if (!panel || !activeAdapter) {
      return;
    }

    const snapshot = activeAdapter.getSnapshot?.() ?? {};
    const debugText = activeAdapter.formatDebugText
      ? activeAdapter.formatDebugText(snapshot)
      : JSON.stringify(snapshot, null, 2);
    panel.diagnostics.value = debugText;

    const title = typeof activeAdapter.title === "string" ? activeAdapter.title : activeAdapter.id;
    panel.title.textContent = title;
    const pageMode = typeof snapshot?.pageMode === "string" ? snapshot.pageMode : "unknown";
    panel.subtitle.textContent = `${activeAdapter.id} / ${pageMode}`;
  }

  function resolveControlDisplayValue(control, values) {
    const rawValue = values?.[control.key];
    if (typeof rawValue === "number" && Number.isFinite(rawValue)) {
      return rawValue;
    }
    return Number(control.defaultValue ?? 0);
  }

  function syncControlInputs(options = {}) {
    if (!activeAdapter) {
      return;
    }

    const force = options.force === true;
    const values = activeAdapter.getOverrides?.() ?? {};
    for (const [key, entry] of controlInputs.entries()) {
      const { control, input } = entry;
      if (!(input instanceof HTMLInputElement)) {
        continue;
      }

      if (!force && document.activeElement === input) {
        continue;
      }

      const nextValue = resolveControlDisplayValue(control, values);
      const nextText = String(nextValue);
      if (input.value !== nextText) {
        input.value = nextText;
      }
      controlInputs.set(key, { control, input });
    }
  }

  function scheduleRefreshLoop() {
    stopRefreshLoop();
    renderDiagnostics();
    refreshTimer = window.setInterval(() => {
      renderDiagnostics();
    }, SNAPSHOT_REFRESH_MS);
  }

  function buildControlField(control, value) {
    const wrapper = document.createElement("label");
    wrapper.style.display = "grid";
    wrapper.style.gap = "4px";

    const label = document.createElement("span");
    label.textContent = control.label;
    label.style.fontSize = "11px";
    label.style.opacity = "0.74";

    const input = document.createElement("input");
    input.type = "number";
    input.value = String(typeof value === "number" ? value : control.defaultValue ?? 0);
    input.step = String(control.step ?? 1);
    if (typeof control.min === "number") {
      input.min = String(control.min);
    }
    if (typeof control.max === "number") {
      input.max = String(control.max);
    }
    input.style.width = "100%";
    input.style.boxSizing = "border-box";
    input.style.border = "1px solid rgba(255,255,255,0.12)";
    input.style.borderRadius = "8px";
    input.style.padding = "6px 8px";
    input.style.background = "rgba(255,255,255,0.04)";
    input.style.color = "inherit";
    input.style.font = "inherit";

    const commitValue = () => {
      if (!activeAdapter?.setOverrides) {
        return;
      }

      const rawValue = input.value.trim();
      if (
        rawValue === ""
        || rawValue === "-"
        || rawValue === "+"
        || rawValue === "."
        || rawValue === "-."
        || rawValue === "+."
      ) {
        return;
      }

      const nextValue = Number.parseFloat(rawValue);
      if (!Number.isFinite(nextValue)) {
        return;
      }

      const resolvedValue = nextValue;
      activeAdapter.setOverrides({ [control.key]: resolvedValue });
      void persistAdapterOverrides();
      renderDiagnostics();
    };

    input.addEventListener("input", commitValue);
    input.addEventListener("change", commitValue);
    input.addEventListener("blur", () => {
      syncControlInputs({ force: true });
    });

    wrapper.appendChild(label);
    wrapper.appendChild(input);
    controlInputs.set(control.key, { control, input });
    return wrapper;
  }

  function renderControls() {
    if (!panel || !activeAdapter) {
      return;
    }

    panel.controls.replaceChildren();
    controlInputs = new Map();
    const controls = Array.isArray(activeAdapter.getControls?.()) ? activeAdapter.getControls() : [];
    const values = activeAdapter.getOverrides?.() ?? {};

    for (const control of controls) {
      panel.controls.appendChild(buildControlField(control, values[control.key]));
    }
  }

  async function persistAdapterOverrides() {
    if (!activeAdapter?.id || !activeAdapter?.getOverrides) {
      return;
    }

    try {
      await storageSet({
        [`${OVERRIDES_PREFIX}${activeAdapter.id}`]: activeAdapter.getOverrides(),
      });
    } catch (error) {
      console.error("[FlowSelect] Failed to persist injection debug overrides:", error);
    }
  }

  async function loadAdapterOverrides(adapter) {
    if (!adapter?.id || !adapter?.setOverrides) {
      return;
    }

    try {
      const result = await storageGet(`${OVERRIDES_PREFIX}${adapter.id}`);
      const overrides = result?.[`${OVERRIDES_PREFIX}${adapter.id}`];
      if (overrides && typeof overrides === "object" && !Array.isArray(overrides)) {
        adapter.setOverrides(overrides);
      }
    } catch (error) {
      console.error("[FlowSelect] Failed to load injection debug overrides:", error);
    }
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
    } catch (_) {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      textarea.remove();
    }
  }

  function bindPanelEvents() {
    if (!panel) {
      return;
    }

    panel.copyParamsButton?.addEventListener("click", () => {
      if (!activeAdapter) {
        return;
      }
      const payload = {
        site: activeAdapter.id,
        title: activeAdapter.title ?? activeAdapter.id,
        overrides: activeAdapter.getOverrides?.() ?? {},
      };
      void copyText(JSON.stringify(payload, null, 2));
    });

    panel.copyDebugButton?.addEventListener("click", () => {
      if (!activeAdapter) {
        return;
      }
      const snapshot = activeAdapter.getSnapshot?.() ?? {};
      const payload = {
        site: activeAdapter.id,
        title: activeAdapter.title ?? activeAdapter.id,
        overrides: activeAdapter.getOverrides?.() ?? {},
        snapshot,
      };
      const text = activeAdapter.formatDebugText
        ? activeAdapter.formatDebugText(snapshot)
        : JSON.stringify(payload, null, 2);
      void copyText(text);
    });

    panel.resetButton?.addEventListener("click", () => {
      if (!activeAdapter?.resetOverrides) {
        return;
      }
      activeAdapter.resetOverrides();
      void persistAdapterOverrides();
      syncControlInputs({ force: true });
      renderDiagnostics();
    });

    panel.toggleDetailsButton?.addEventListener("click", () => {
      diagnosticsCollapsed = !diagnosticsCollapsed;
      applyDiagnosticsVisibility();
      applyPanelBounds();
    });

    panel.header.addEventListener("pointerdown", (event) => {
      if (!(event.target instanceof HTMLElement) || event.target.closest("button")) {
        return;
      }

      const rect = panel.container.getBoundingClientRect();
      dragState = {
        pointerId: event.pointerId,
        offsetX: event.clientX - rect.left,
        offsetY: event.clientY - rect.top,
      };
      panel.header.setPointerCapture(event.pointerId);
    });

    panel.header.addEventListener("pointermove", (event) => {
      if (!dragState || dragState.pointerId !== event.pointerId) {
        return;
      }

      currentPosition = clampPosition({
        x: event.clientX - dragState.offsetX,
        y: event.clientY - dragState.offsetY,
      });
      applyPanelBounds();
    });

    const endDrag = (event) => {
      if (!dragState || dragState.pointerId !== event.pointerId) {
        return;
      }

      dragState = null;
      void persistPanelPosition();
      panel.header.releasePointerCapture(event.pointerId);
    };

    panel.header.addEventListener("pointerup", endDrag);
    panel.header.addEventListener("pointercancel", endDrag);

    const resizeObserver = new ResizeObserver(() => {
      if (!panel) {
        return;
      }
      const rect = panel.container.getBoundingClientRect();
      currentSize = {
        width: Math.round(rect.width),
        height: diagnosticsCollapsed
          ? (currentSize?.height ?? DEFAULT_PANEL_HEIGHT_PX)
          : Math.round(rect.height),
      };
      void persistPanelSize();
      applyPanelBounds();
    });
    resizeObserver.observe(panel.container);
    panel.resizeObserver = resizeObserver;
  }

  async function ensurePanel() {
    if (panel) {
      return panel;
    }

    panel = createPanelElement();
    document.documentElement.appendChild(panel.container);
    await loadPersistedPanelState();
    applyDiagnosticsVisibility();
    applyPanelBounds();
    bindPanelEvents();
    return panel;
  }

  function destroyPanel() {
    stopRefreshLoop();
    if (panel?.resizeObserver) {
      panel.resizeObserver.disconnect();
    }
    panel?.container.remove();
    panel = null;
    activeAdapter = null;
    dragState = null;
    controlInputs = new Map();
  }

  async function mountAdapter(adapter) {
    if (!adapter || typeof adapter.id !== "string") {
      return;
    }

    activeAdapter = adapter;
    await ensurePanel();
    await loadAdapterOverrides(adapter);
    renderControls();
    renderDiagnostics();
    scheduleRefreshLoop();
  }

  function unmountAdapter(adapterId) {
    if (!activeAdapter || (adapterId && activeAdapter.id !== adapterId)) {
      return;
    }
    destroyPanel();
  }

  function refresh() {
    syncControlInputs();
    renderDiagnostics();
  }

  root.FlowSelectInjectionDebugPanel = {
    mountAdapter,
    refresh,
    unmountAdapter,
  };
})(typeof self !== "undefined" ? self : window);
