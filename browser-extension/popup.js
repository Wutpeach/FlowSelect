// FlowSelect Browser Extension - Popup Script

const directDownloadQuality = window.FlowSelectDirectDownloadQuality;
const localeUtils = window.FlowSelectLocaleUtils;
const FALLBACK_LANGUAGE = localeUtils?.FALLBACK_LANGUAGE || "en";
const STATUS_STATE_CONNECTED = "connected";
const STATUS_STATE_CONNECTING = "connecting";
const STATUS_STATE_OFFLINE = "offline";

function applyTheme(theme) {
  document.body.classList.toggle("flowselect-theme-white", theme === "white");
  document.body.classList.toggle("flowselect-theme-black", theme !== "white");
}

function sendRuntimeMessage(message) {
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime?.lastError) {
          resolve(null);
          return;
        }
        resolve(response ?? null);
      });
    } catch (error) {
      console.error("[FlowSelect] Failed to send runtime message:", error);
      resolve(null);
    }
  });
}

function normalizeConnectionState(response) {
  if (!response || typeof response !== "object") {
    return STATUS_STATE_OFFLINE;
  }

  if (
    response.state === STATUS_STATE_CONNECTED ||
    response.state === STATUS_STATE_CONNECTING ||
    response.state === STATUS_STATE_OFFLINE
  ) {
    return response.state;
  }

  if (response.connected === true) {
    return STATUS_STATE_CONNECTED;
  }

  if (response.statusText === "Connecting" || response.connecting === true) {
    return STATUS_STATE_CONNECTING;
  }

  return STATUS_STATE_OFFLINE;
}

document.addEventListener("DOMContentLoaded", () => {
  const statusText = document.getElementById("statusText");
  const statusCard = document.getElementById("statusCard");
  const statusHint = document.getElementById("statusHint");
  const qualityGrid = document.getElementById("qualityGrid");
  const aeCompatibilityToggle = document.getElementById("aeCompatibilityToggle");
  const aeCompatibilityState = document.getElementById("aeCompatibilityState");
  const aeCompatibilityToggleLabel = document.getElementById("aeCompatibilityToggleLabel");
  const popupTitle = document.getElementById("popupTitle");
  const popupSubtitle = document.getElementById("popupSubtitle");
  const qualitySectionTitle = document.getElementById("qualitySectionTitle");
  const aeFormatTitle = document.getElementById("aeFormatTitle");
  let statusTimer = null;
  let currentBundle = {
    language: FALLBACK_LANGUAGE,
    common: {},
    extension: {},
  };
  let currentStatusState = STATUS_STATE_OFFLINE;
  let currentQualityPreference = directDownloadQuality.DEFAULT_QUALITY_PREFERENCE;
  let aeFriendlyConversionEnabled =
    directDownloadQuality.DEFAULT_AE_FRIENDLY_CONVERSION_ENABLED;

  function t(key, fallback) {
    return localeUtils?.translate(currentBundle, key, fallback) || fallback || key;
  }

  function renderStaticCopy() {
    popupTitle.textContent = t("app.name", "FlowSelect");
    popupSubtitle.textContent = t("popup.subtitle", "Extension");
    qualitySectionTitle.textContent = t("popup.sections.quality", "Quality");
    aeFormatTitle.textContent = t("popup.sections.aeFormat", "AE Format");
    aeCompatibilityToggle.setAttribute(
      "aria-label",
      t("popup.preferences.ae.toggleAriaLabel", "Toggle AE format")
    );
    document.title = t("app.name", "FlowSelect");
  }

  function getStatusCopy(state) {
    if (state === STATUS_STATE_CONNECTED) {
      return {
        label: t("popup.status.connected.label", "Connected"),
        hint: t("popup.status.connected.hint", "Desktop app ready."),
      };
    }

    if (state === STATUS_STATE_CONNECTING) {
      return {
        label: t("popup.status.connecting.label", "Connecting"),
        hint: t("popup.status.connecting.hint", "Trying desktop app..."),
      };
    }

    return {
      label: t("popup.status.offline.label", "Offline"),
      hint: t("popup.status.offline.hint", "Open desktop app to connect."),
    };
  }

  function updateStatus(nextState) {
    currentStatusState = nextState;
    const copy = getStatusCopy(nextState);
    statusCard.dataset.connected = nextState === STATUS_STATE_CONNECTED ? "true" : "false";
    statusCard.dataset.state = nextState;
    statusText.textContent = copy.label;
    statusHint.textContent = copy.hint;
  }

  async function checkStatus() {
    const response = await sendRuntimeMessage({ type: "get_status" });
    updateStatus(normalizeConnectionState(response));
  }

  function renderQualityOptions(selectedValue) {
    currentQualityPreference = selectedValue;
    qualityGrid.innerHTML = "";

    directDownloadQuality.QUALITY_PREFERENCE_OPTIONS.forEach((option) => {
      const button = document.createElement("button");
      const label = document.createElement("span");

      button.type = "button";
      button.className = "flowselect-quality-btn";
      button.dataset.quality = option.value;
      if (option.value === selectedValue) {
        button.classList.add("active");
      }

      label.className = "flowselect-quality-value";
      label.textContent = t(option.labelKey, option.value);
      button.title = t(option.descriptionKey, "");
      button.appendChild(label);

      button.addEventListener("click", async () => {
        try {
          const savedValue = await directDownloadQuality.setQualityPreference(option.value);
          renderQualityOptions(savedValue);
        } catch (error) {
          console.error("[FlowSelect] Failed to save quality preference:", error);
        }
      });

      qualityGrid.appendChild(button);
    });
  }

  function renderAeCompatibilityOption(enabled) {
    aeFriendlyConversionEnabled = enabled === true;
    aeCompatibilityToggle.dataset.enabled = aeFriendlyConversionEnabled ? "true" : "false";
    aeCompatibilityToggle.setAttribute(
      "aria-checked",
      aeFriendlyConversionEnabled ? "true" : "false"
    );
    aeCompatibilityToggleLabel.textContent = aeFriendlyConversionEnabled
      ? t("popup.preferences.ae.toggleLabelOn", "AE")
      : t("popup.preferences.ae.toggleLabelOff", "Original");
    aeCompatibilityState.textContent = aeFriendlyConversionEnabled
      ? t("popup.preferences.ae.stateOn", "Slower finish")
      : t("popup.preferences.ae.stateOff", "Keep original file");
  }

  async function applyLanguage(nextLanguage) {
    currentBundle = await localeUtils.loadLocaleBundle(nextLanguage);
    document.documentElement.lang = currentBundle.language;
    renderStaticCopy();
    renderQualityOptions(currentQualityPreference);
    renderAeCompatibilityOption(aeFriendlyConversionEnabled);
    updateStatus(currentStatusState);
  }

  async function resolveInitialLanguage() {
    return localeUtils.resolveCurrentLanguage(navigator.language);
  }

  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === "theme_update") {
      applyTheme(message.theme);
      return;
    }

    if (message.type === "connection_update") {
      updateStatus(normalizeConnectionState(message));
      return;
    }

    if (message.type === "language_update") {
      const nextLanguage = localeUtils.normalizeAppLanguage(message.language);
      if (nextLanguage) {
        void applyLanguage(nextLanguage);
      }
    }
  });

  if (aeCompatibilityToggle) {
    aeCompatibilityToggle.addEventListener("click", async () => {
      const currentEnabled = aeCompatibilityToggle.dataset.enabled === "true";
      try {
        const nextEnabled = await directDownloadQuality.setAeFriendlyConversionEnabled(
          !currentEnabled
        );
        renderAeCompatibilityOption(nextEnabled);
      } catch (error) {
        console.error("[FlowSelect] Failed to save AE-friendly conversion preference:", error);
      }
    });
  }

  window.addEventListener("beforeunload", () => {
    if (statusTimer !== null) {
      clearInterval(statusTimer);
      statusTimer = null;
    }
  });

  void (async () => {
    await applyLanguage(await resolveInitialLanguage());

    try {
      currentQualityPreference = await directDownloadQuality.getQualityPreference();
      renderQualityOptions(currentQualityPreference);
    } catch (error) {
      console.error("[FlowSelect] Failed to load quality preference:", error);
    }

    try {
      aeFriendlyConversionEnabled =
        await directDownloadQuality.getAeFriendlyConversionEnabled();
      renderAeCompatibilityOption(aeFriendlyConversionEnabled);
    } catch (error) {
      console.error("[FlowSelect] Failed to load AE-friendly conversion preference:", error);
    }

    chrome.runtime.sendMessage({ type: "connect" }, () => {
      if (chrome.runtime?.lastError) {
        return;
      }
    });
    void checkStatus();

    const themeResponse = await sendRuntimeMessage({ type: "get_theme" });
    applyTheme(themeResponse?.theme || "black");

    statusTimer = window.setInterval(() => {
      void checkStatus();
    }, 1200);
  })();
});
