// FlowSelect Browser Extension - Content Script
// Entry point for element picker

(function() {
  'use strict';

  console.log('[FlowSelect Content] Script loaded');

  let pickerActive = false;
  let picker = null;

  // Listen for messages from background script
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    switch (message.type) {
      case 'start_picker':
        console.log('[FlowSelect Content] Received start_picker');
        startPicker();
        sendResponse({ success: true });
        break;
      case 'stop_picker':
        stopPicker();
        sendResponse({ success: true });
        break;
    }
    return true;
  });

  function startPicker() {
    console.log('[FlowSelect] startPicker called');
    if (pickerActive) return;
    pickerActive = true;

    // Dynamically load picker.js if not already loaded
    if (!picker) {
      picker = new FlowSelectPicker({
        onSelect: handleVideoSelect,
        onCancel: stopPicker
      });
    }
    picker.start();
  }

  function stopPicker() {
    if (!pickerActive) return;
    pickerActive = false;
    if (picker) {
      picker.stop();
    }
  }

  function handleVideoSelect(videoData) {
    console.log('[FlowSelect Content] handleVideoSelect called:', videoData);
    chrome.runtime.sendMessage({
      type: 'video_selection',
      url: videoData.src,
      title: videoData.title || document.title
    });
    console.log('[FlowSelect Content] Message sent to background');
    stopPicker();
  }
})();
