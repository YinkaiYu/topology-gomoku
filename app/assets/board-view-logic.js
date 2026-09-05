(function attachBoardViewLogic(root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.TopologyBoardViewLogic = factory();
  }
}(typeof self !== "undefined" ? self : this, function createBoardViewLogic() {
  "use strict";

  function clamp01(value) {
    return Math.max(0, Math.min(1, Number(value) || 0));
  }

  return {
    placementEligibleAtDown: function placementEligibleAtDown(canPlace) {
      return Boolean(canPlace);
    },
    shouldPlaceOnRelease: function shouldPlaceOnRelease(eligibleAtDown, dragging, canPlaceCell) {
      return Boolean(eligibleAtDown && !dragging && canPlaceCell);
    },
    shouldDelayAi: function shouldDelayAi(view) {
      return Boolean(view && (view.transitioning || view.scrubbing));
    },
    interpolateProgress: function interpolateProgress(start, easedProgress) {
      var initial = clamp01(start);
      return initial + (1 - initial) * clamp01(easedProgress);
    }
  };
}));
