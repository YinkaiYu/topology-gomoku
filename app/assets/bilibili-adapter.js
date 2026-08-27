(function bilibiliToyAdapter() {
  "use strict";

  var root = document.documentElement;
  var cleanup = [];
  var lastState = null;

  function finitePixel(value) {
    var number = Number(value);
    return Number.isFinite(number) && number >= 0 ? number + "px" : "0px";
  }

  function setViewportHeight() {
    var viewport = window.visualViewport;
    var height = viewport && viewport.height ? viewport.height : window.innerHeight;
    if (Number.isFinite(height) && height > 0) {
      root.style.setProperty("--toy-viewport-height", Math.round(height) + "px");
    }
  }

  function applyContainerState(state) {
    if (!state || typeof state !== "object") {
      return;
    }
    lastState = state;
    var safeArea = state.safeArea || {};
    root.style.setProperty("--safe-area-inset-top", finitePixel(safeArea.top));
    root.style.setProperty("--safe-area-inset-right", finitePixel(safeArea.right));
    root.style.setProperty("--safe-area-inset-bottom", finitePixel(safeArea.bottom));
    root.style.setProperty("--safe-area-inset-left", finitePixel(safeArea.left));
    root.dataset.toyDevice = state.deviceType || "unknown";
    root.dataset.toyOrientation = state.orientation || "unknown";
    root.dataset.toyContainer = "bilibili-app";
    root.dataset.toyImmersive = String(Boolean(state.immersive));
    window.dispatchEvent(new CustomEvent("toycontainerchange", { detail: state }));
  }

  function addViewportListeners() {
    window.addEventListener("resize", setViewportHeight);
    cleanup.push(function removeWindowResize() {
      window.removeEventListener("resize", setViewportHeight);
    });
    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", setViewportHeight);
      cleanup.push(function removeVisualViewportResize() {
        window.visualViewport.removeEventListener("resize", setViewportHeight);
      });
    }
  }

  async function initializeSdk() {
    var sdk = window.toy;
    if (!sdk || typeof sdk.isSupport !== "function") {
      root.dataset.toyContainer = "browser";
      return;
    }

    try {
      var supportsContainer = await sdk.isSupport("onContainerChange");
      if (!supportsContainer || typeof sdk.onContainerChange !== "function") {
        root.dataset.toyContainer = "browser";
        return;
      }
      var off = sdk.onContainerChange(applyContainerState);
      if (typeof off === "function") {
        cleanup.push(off);
      }

      var supportsMode = await sdk.isSupport("setContainerMode");
      if (supportsMode && typeof sdk.setContainerMode === "function") {
        await sdk.setContainerMode({ orientation: "auto", immersive: true });
      }
    } catch (error) {
      root.dataset.toyContainer = lastState ? "bilibili-app" : "browser";
    }
  }

  function destroy() {
    while (cleanup.length) {
      try {
        cleanup.pop()();
      } catch (error) {
        // Cleanup is best effort when the host tears down the WebView.
      }
    }
  }

  setViewportHeight();
  addViewportListeners();
  initializeSdk();
  window.addEventListener("pagehide", destroy, { once: true });

  window.BilibiliToyPlatform = {
    getContainerState: function getContainerState() {
      return lastState;
    },
    refreshViewport: setViewportHeight
  };
})();
