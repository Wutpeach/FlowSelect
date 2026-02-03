// FlowSelect Browser Extension - Background Service Worker
// WebSocket client for communication with FlowSelect desktop app

let ws = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;
const WS_URL = 'ws://127.0.0.1:18900';

// Store current theme from desktop app
let currentTheme = 'black';

function connect() {
  if (ws && ws.readyState === WebSocket.OPEN) return;

  ws = new WebSocket(WS_URL);

  ws.onopen = () => {
    console.log('[FlowSelect] Connected to desktop app');
    reconnectAttempts = 0;
  };

  ws.onmessage = (event) => {
    try {
      const message = JSON.parse(event.data);
      handleMessage(message);
    } catch (e) {
      console.error('[FlowSelect] Failed to parse message:', e);
    }
  };

  ws.onclose = () => {
    console.log('[FlowSelect] Disconnected');
    scheduleReconnect();
  };

  ws.onerror = (error) => {
    console.error('[FlowSelect] WebSocket error:', error);
  };
}

function scheduleReconnect() {
  if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    console.log('[FlowSelect] Max reconnect attempts reached');
    return;
  }
  reconnectAttempts++;
  const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000);
  setTimeout(connect, delay);
}

function handleMessage(message) {
  // Backend uses 'action', extension uses 'type' - check both
  const action = message.action || message.type;

  switch (action) {
    case 'theme_changed':
      currentTheme = message.data?.theme || 'black';
      // Notify popup if open (ignore errors if popup is closed)
      chrome.runtime.sendMessage({ type: 'theme_update', theme: currentTheme }).catch(() => {});
      break;
    case 'theme_info':
      currentTheme = message.theme || 'black';
      chrome.runtime.sendMessage({ type: 'theme_update', theme: currentTheme }).catch(() => {});
      break;
    case 'start_picker':
      startPicker(message.tabId);
      break;
    case 'stop_picker':
      stopPicker(message.tabId);
      break;
  }
}

async function startPicker(tabId) {
  const tab = tabId ? { id: tabId } : (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
  if (tab) {
    chrome.tabs.sendMessage(tab.id, { type: 'start_picker' });
  }
}

async function stopPicker(tabId) {
  const tab = tabId ? { id: tabId } : (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
  if (tab) {
    chrome.tabs.sendMessage(tab.id, { type: 'stop_picker' });
  }
}

function sendToApp(data) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

// Listen for messages from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'video_selected') {
    sendToApp({
      action: 'video_selected',
      data: {
        url: message.url,
        pageUrl: sender.tab?.url,
        title: message.title
      }
    });
    sendResponse({ success: true });
  } else if (message.type === 'connect') {
    connect();
    sendResponse({
      success: true,
      connected: ws && ws.readyState === WebSocket.OPEN
    });
  } else if (message.type === 'get_status') {
    sendResponse({
      connected: ws && ws.readyState === WebSocket.OPEN
    });
  } else if (message.type === 'get_theme') {
    sendResponse({ theme: currentTheme });
  }
  return true;
});

// Auto-connect on startup
connect();
