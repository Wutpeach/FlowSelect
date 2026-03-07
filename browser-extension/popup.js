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
  const statusChip = document.getElementById('statusChip');
  const statusHint = document.getElementById('statusHint');
  const qualityGrid = document.getElementById('qualityGrid');
  let statusTimer = null;

  function updateStatus(connected, nextStatusText) {
    statusCard.dataset.connected = connected ? 'true' : 'false';
    if (connected) {
      statusText.textContent = 'Connected to desktop app';
      statusChip.textContent = 'Live';
      statusHint.textContent = 'Theme, queue actions, and extension download requests are synced.';
    } else {
      statusText.textContent = nextStatusText || 'Desktop app not running';
      statusChip.textContent = 'Offline';
      statusHint.textContent = 'Open FlowSelect to restore connection, queueing, and theme sync.';
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
      if (option.value === selectedValue) {
        button.classList.add('active');
      }
      button.innerHTML = `
        <span class="flowselect-quality-value">${option.label}</span>
      `;
      button.title = option.description;
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

  // Initial connection attempt and status check
  chrome.runtime.sendMessage({ type: 'connect' });
  checkStatus();
  directDownloadQuality.getQualityPreference().then(renderQualityOptions);

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
