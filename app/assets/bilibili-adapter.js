(function bilibiliToyAdapter() {
  "use strict";

  var root = document.documentElement;
  var cleanup = [];
  var lastState = null;
  var sdk = null;
  var supportsMode = false;
  var readyPromise = null;

  root.dataset.toyImmersive = "false";
  root.dataset.toyImmersiveRequested = "false";

  function finitePixel(value) {
    var number = Number(value);
    return Number.isFinite(number) && number >= 0 ? number + "px" : "0px";
  }

  function setViewportHeight(hostHeight) {
    var requestedHeight = Number(hostHeight);
    var stateHeight = lastState && lastState.viewport ? Number(lastState.viewport.height) : NaN;
    var viewport = window.visualViewport;
    var height = Number.isFinite(requestedHeight) && requestedHeight > 0
      ? requestedHeight
      : Number.isFinite(stateHeight) && stateHeight > 0
        ? stateHeight
        : viewport && viewport.height
          ? viewport.height
          : window.innerHeight;
    if (Number.isFinite(height) && height > 0) {
      root.style.setProperty("--toy-viewport-height", Math.round(height) + "px");
    }
  }

  function applyContainerState(state) {
    if (!state || typeof state !== "object") {
      return;
    }
    lastState = state;
    var viewport = state.viewport || {};
    var safeArea = state.safeArea || {};
    setViewportHeight(viewport.height);
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

  async function requestContainerMode(immersive) {
    if (!supportsMode || !sdk || typeof sdk.setContainerMode !== "function") {
      return false;
    }
    var enabled = Boolean(immersive);
    await sdk.setContainerMode({ immersive: enabled });
    root.dataset.toyImmersiveRequested = String(enabled);
    return true;
  }

  async function supports(ability, method) {
    if (!sdk || typeof sdk.isSupport !== "function" || typeof sdk[method] !== "function") {
      return false;
    }
    try {
      return Boolean(await sdk.isSupport(ability));
    } catch (error) {
      return false;
    }
  }

  async function initializeSdk() {
    sdk = window.toy;
    if (!sdk || typeof sdk.isSupport !== "function") {
      root.dataset.toyContainer = "browser";
      return;
    }

    var supportsContainerChanges = await supports("onContainerChange", "onContainerChange");
    var supportsContainerState = await supports("getContainerState", "getContainerState");
    supportsMode = await supports("setContainerMode", "setContainerMode");

    if (supportsContainerChanges) {
      try {
        // Register before requesting a mode so no state transition is missed.
        var off = sdk.onContainerChange(applyContainerState);
        if (typeof off === "function") {
          cleanup.push(off);
        }
      } catch (error) {
        supportsContainerChanges = false;
      }
    }

    if (!supportsContainerChanges && supportsContainerState) {
      try {
        applyContainerState(await sdk.getContainerState());
      } catch (error) {
        // Mode control can still work when state observation is unavailable.
      }
    }

    if (!lastState) {
      root.dataset.toyContainer = supportsMode ? "bilibili-app" : "browser";
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
  readyPromise = initializeSdk();
  window.addEventListener("pagehide", destroy, { once: true });

  window.BilibiliToyPlatform = {
    getContainerState: function getContainerState() {
      return lastState;
    },
    setImmersive: function setImmersive(enabled) {
      return readyPromise.then(function applyRequestedMode() {
        return requestContainerMode(Boolean(enabled));
      }).catch(function rejectRequestedMode() {
        return false;
      });
    },
    refreshViewport: setViewportHeight
  };
})();
