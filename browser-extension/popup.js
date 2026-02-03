// FlowSelect Browser Extension - Popup Script

document.addEventListener('DOMContentLoaded', () => {
  const statusDot = document.getElementById('statusDot');
  const statusText = document.getElementById('statusText');
  const refreshBtn = document.getElementById('refreshBtn');

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
});
