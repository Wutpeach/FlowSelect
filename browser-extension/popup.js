// FlowSelect Browser Extension - Popup Script

document.addEventListener('DOMContentLoaded', () => {
  const statusDot = document.getElementById('statusDot');
  const statusText = document.getElementById('statusText');
  const pickBtn = document.getElementById('pickBtn');

  // Request connection status
  chrome.runtime.sendMessage({ type: 'connect' });

  // Get and display connection status
  chrome.runtime.sendMessage({ type: 'get_status' }, (response) => {
    if (response?.connected) {
      statusDot.style.background = '#4ade80';
      statusText.textContent = 'Connected';
    } else {
      statusDot.style.background = '#f87171';
      statusText.textContent = 'Disconnected';
    }
  });

  // Handle pick button click
  pickBtn.addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) {
      await chrome.tabs.sendMessage(tab.id, { type: 'start_picker' });
      window.close();
    }
  });
});
