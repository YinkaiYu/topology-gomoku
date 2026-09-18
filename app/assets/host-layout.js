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
    return isEmbedded()
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
