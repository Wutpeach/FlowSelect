// FlowSelect Browser Extension - Popup Script

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
  const refreshBtn = document.getElementById('refreshBtn');
  let statusTimer = null;

  function updateStatus(connected) {
    if (connected) {
      statusDot.classList.add('connected');
      statusText.textContent = 'Connected';
    } else {
      statusDot.classList.remove('connected');
      statusText.textContent = 'Disconnected';
    }
  }

  function checkStatus() {
    chrome.runtime.sendMessage({ type: 'get_status' }, (response) => {
      updateStatus(response?.connected);
    });
  }

  // Initial connection attempt and status check
  chrome.runtime.sendMessage({ type: 'connect' });
  checkStatus();

  // Query current theme from background
  chrome.runtime.sendMessage({ type: 'get_theme' }, (response) => {
    applyTheme(response?.theme || 'black');
  });

  // Listen for theme updates from background
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'theme_update') {
      applyTheme(message.theme);
    } else if (message.type === 'connection_update') {
      updateStatus(Boolean(message.connected));
    }
  });

  // Refresh button - reconnect and update status
  refreshBtn.addEventListener('click', () => {
    refreshBtn.textContent = 'Connecting...';
    chrome.runtime.sendMessage({ type: 'connect' }, () => {
      setTimeout(() => {
        checkStatus();
        refreshBtn.textContent = 'Reconnect';
      }, 500);
    });
  });

  statusTimer = window.setInterval(checkStatus, 1200);
  window.addEventListener('beforeunload', () => {
    if (statusTimer !== null) {
      clearInterval(statusTimer);
      statusTimer = null;
    }
  });
});
