(function configureTopologyHostLayout(root, win) {
  "use strict";

  function isEmbedded() {
    try {
      return win.top !== win.self;
    } catch (error) {
      return true;
    }
  }

  function needsCompactLayout() {
    var platform = root.dataset.hostPlatform;
    var hostname = win.location && win.location.hostname || "";
    return isEmbedded()
      || platform === "web"
      || platform === "zhihu"
      || /(^|\.)aiworks\.site$/i.test(hostname)
      || Boolean(win.toy)
      || Boolean(win.BilibiliToyPlatform)
      || root.dataset.toyContainer === "bilibili-app";
  }

  function applyHostLayout() {
    root.dataset.hostLayout = needsCompactLayout() ? "compact" : "xiaohongshu";
  }

  applyHostLayout();
  if (typeof win.addEventListener === "function") {
    win.addEventListener("toycontainerchange", applyHostLayout);
  }
})(document.documentElement, window);
