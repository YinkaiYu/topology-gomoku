(function attachBoardViewLogic(root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  if (root) { root.TopologyBoardViewLogic = api; }
}(typeof globalThis !== "undefined" ? globalThis : this, function createBoardViewLogic() {
  "use strict";

  function clamp01(value) {
    return Math.max(0, Math.min(1, Number(value) || 0));
  }

  return {
    hitProjectedCell: function hitProjectedCell(count, pointAt, x, y, radius) {
      var cell = -1;
      var distance = Infinity;
      for (var index = 0; index < count; index += 1) {
        var point = pointAt(index);
        var next = Math.hypot(x - point.x, y - point.y);
        if (next < distance) { distance = next; cell = index; }
      }
      return distance <= radius ? cell : -1;
    },
    completionOrientation: function completionOrientation(completion, viewBlend, jellyScale, restingBounce, sphereCompletion, Morph, time) {
      return {
      x: completion.startRotation.x * (1 - viewBlend) + completion.view.x * viewBlend + completion.rotation.x,
      y: completion.startRotation.y * (1 - viewBlend) + completion.view.y * viewBlend + completion.rotation.y,
      z: completion.startRotation.z * (1 - viewBlend) + completion.view.z * viewBlend + completion.rotation.z,
      scale: jellyScale,
      shapeX: sphereCompletion ? 1 : 1 + ((Number(completion.view.shapeX) || 1) - 1) * viewBlend,
      shapeY: sphereCompletion ? 1 : 1 + ((Number(completion.view.shapeY) || 1) - 1) * viewBlend,
      shapeZ: sphereCompletion ? 1 : 1 + ((Number(completion.view.shapeZ) || 1) - 1) * viewBlend,
      wobbleX: completion.startWobble.x * (1 - viewBlend) + completion.elastic.x + (sphereCompletion ? 0 : restingBounce),
      wobbleY: completion.startWobble.y * (1 - viewBlend) + completion.elastic.y + (sphereCompletion ? 0 : Math.cos(time * 0.0021) * (completion.settled ? 0.009 : 0)),
      presentation: Morph.blendPresentation(completion.presentation, completion.settled ? 1 : viewBlend)
    };
    },
    interactiveOrientation: function interactiveOrientation(view, time) {
      return {
        x: view.rotation.x, y: view.rotation.y, z: view.rotation.z,
        scale: 1, shapeX: 1, shapeY: 1, shapeZ: 1,
        wobbleX: view.elastic.x,
        wobbleY: view.elastic.y + Math.sin(time * 0.0019) * 0.006
      };
    },
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
