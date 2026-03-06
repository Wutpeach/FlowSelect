// FlowSelect Browser Extension - Popup Script

const directDownloadQuality = window.FlowSelectDirectDownloadQuality;

// Apply theme to popup
function applyTheme(theme) {
  if (theme === 'white') {
    document.body.classList.add('white');
  } else {
    document.body.classList.remove('white');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const statusDot = document.getElementById('statusDot');
  const statusText = document.getElementById('statusText');
  const qualityGrid = document.getElementById('qualityGrid');
  let statusTimer = null;

  function updateStatus(connected, nextStatusText) {
    if (connected) {
      statusDot.classList.add('connected');
      statusText.textContent = 'Connected';
    } else {
      statusDot.classList.remove('connected');
      statusText.textContent = nextStatusText || 'Desktop app not running';
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
      button.className = 'quality-btn';
      if (option.value === selectedValue) {
        button.classList.add('active');
      }
      button.innerHTML = `
        <span class="quality-value">${option.label}</span>
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
