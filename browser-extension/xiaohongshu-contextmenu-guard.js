(function () {
  "use strict";

  function isXiaohongshuHost() {
    return /(?:^|\.)xiaohongshu\.com$/i.test(window.location.hostname)
      || /(?:^|\.)xhslink\.com$/i.test(window.location.hostname);
  }

  function isDetailPage() {
    return (
      window.location.pathname.includes("/explore/")
      || window.location.pathname.includes("/discovery/item/")
    );
  }

  function shouldKeepNativeContextMenu(event) {
    if (!(event.target instanceof Element)) {
      return !isDetailPage();
    }

    if (event.target.closest("#flowselect-xhs-download-btn, .flowselect-xhs-control-btn")) {
      return false;
    }

    return !isDetailPage();
  }

  function allowNativeContextMenu(event) {
    if (!isXiaohongshuHost() || !shouldKeepNativeContextMenu(event)) {
      return;
    }

    event.stopImmediatePropagation();
  }

  window.addEventListener("contextmenu", allowNativeContextMenu, true);
  document.addEventListener("contextmenu", allowNativeContextMenu, true);
})();
