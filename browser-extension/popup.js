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
    console.log('[FlowSelect Popup] Pick button clicked');
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    console.log('[FlowSelect Popup] Tab:', tab);
    if (tab) {
      try {
        await chrome.tabs.sendMessage(tab.id, { type: 'start_picker' });
        console.log('[FlowSelect Popup] Message sent');
      } catch (e) {
        console.error('[FlowSelect Popup] Send failed:', e);
      }
      window.close();
    }
  });
});
