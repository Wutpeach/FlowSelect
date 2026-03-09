// FlowSelect Browser Extension - Popup Script

const directDownloadQuality = window.FlowSelectDirectDownloadQuality;

// Apply theme to popup
function applyTheme(theme) {
  document.body.classList.toggle('flowselect-theme-white', theme === 'white');
  document.body.classList.toggle('flowselect-theme-black', theme !== 'white');
}

document.addEventListener('DOMContentLoaded', () => {
  const statusText = document.getElementById('statusText');
  const statusCard = document.getElementById('statusCard');
  const statusHint = document.getElementById('statusHint');
  const qualityGrid = document.getElementById('qualityGrid');
  const aeCompatibilityToggle = document.getElementById('aeCompatibilityToggle');
  const aeCompatibilityState = document.getElementById('aeCompatibilityState');
  const aeCompatibilityToggleLabel = document.getElementById('aeCompatibilityToggleLabel');
  let statusTimer = null;

  function updateStatus(connected, nextStatusText) {
    statusCard.dataset.connected = connected ? 'true' : 'false';
    if (connected) {
      statusCard.dataset.state = 'connected';
      statusText.textContent = 'Connected';
      statusHint.textContent = 'Desktop app ready.';
    } else {
      const isConnecting = nextStatusText === 'Connecting';
      statusCard.dataset.state = isConnecting ? 'connecting' : 'offline';
      statusText.textContent = nextStatusText || 'Offline';
      statusHint.textContent = isConnecting ? 'Trying desktop app...' : 'Open desktop app to connect.';
    }
  }

  function checkStatus() {
    chrome.runtime.sendMessage({ type: 'get_status' }, (response) => {
      updateStatus(Boolean(response?.connected), response?.statusText);
    });
  }

  function renderQualityOptions(selectedValue) {
    qualityGrid.innerHTML = '';

    directDownloadQuality.QUALITY_PREFERENCE_OPTIONS.forEach((option) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'flowselect-quality-btn';
      button.dataset.quality = option.value;
      if (option.value === selectedValue) {
        button.classList.add('active');
      }
      button.innerHTML = `
        <span class="flowselect-quality-value">${option.label}</span>
      `;
      button.addEventListener('click', async () => {
        try {
          const savedValue = await directDownloadQuality.setQualityPreference(option.value);
          renderQualityOptions(savedValue);
        } catch (error) {
          console.error('[FlowSelect] Failed to save quality preference:', error);
        }
      });
      qualityGrid.appendChild(button);
    });
  }

  function renderAeCompatibilityOption(enabled) {
    if (!aeCompatibilityToggle || !aeCompatibilityState || !aeCompatibilityToggleLabel) {
      return;
    }

    aeCompatibilityToggle.dataset.enabled = enabled ? 'true' : 'false';
    aeCompatibilityToggle.setAttribute('aria-checked', enabled ? 'true' : 'false');
    aeCompatibilityToggleLabel.textContent = enabled ? 'AE' : 'Original';
    aeCompatibilityState.textContent = enabled ? 'Slower finish' : 'Keep original file';
  }

  // Initial connection attempt and status check
  chrome.runtime.sendMessage({ type: 'connect' });
  checkStatus();
  directDownloadQuality.getQualityPreference().then(renderQualityOptions);
  directDownloadQuality.getAeFriendlyConversionEnabled().then(renderAeCompatibilityOption);

  if (aeCompatibilityToggle) {
    aeCompatibilityToggle.addEventListener('click', async () => {
      const currentEnabled = aeCompatibilityToggle.dataset.enabled === 'true';
      try {
        const nextEnabled = await directDownloadQuality.setAeFriendlyConversionEnabled(!currentEnabled);
        renderAeCompatibilityOption(nextEnabled);
      } catch (error) {
        console.error('[FlowSelect] Failed to save AE-friendly conversion preference:', error);
      }
    });
  }

  // Query current theme from background
  chrome.runtime.sendMessage({ type: 'get_theme' }, (response) => {
    applyTheme(response?.theme || 'black');
  });

  // Listen for theme updates from background
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'theme_update') {
      applyTheme(message.theme);
    } else if (message.type === 'connection_update') {
      updateStatus(Boolean(message.connected), message.statusText);
    }
  });

  statusTimer = window.setInterval(checkStatus, 1200);
  window.addEventListener('beforeunload', () => {
    if (statusTimer !== null) {
      clearInterval(statusTimer);
      statusTimer = null;
    }
  });
});
