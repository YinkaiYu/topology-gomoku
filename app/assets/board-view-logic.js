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

  function shortestAngle(value) {
    var angle = (Number(value) || 0) % (Math.PI * 2);
    if (angle > Math.PI) { angle -= Math.PI * 2; }
    if (angle < -Math.PI) { angle += Math.PI * 2; }
    return angle === 0 ? 0 : angle;
  }

  function interpolateAngle(from, to, amount) {
    return from + shortestAngle(to - from) * amount;
  }

  function prepareMorphRotation(rotation, base, progress) {
    // Rebase only at an endpoint. Wrapping during a partly unfolded drag
    // would change the interpolated pose when the angle crosses +/- PI.
    if (!rotation || (progress !== 0 && progress !== 1)) { return; }
    ["x", "y", "z"].forEach(function rebase(axis) {
      var offset = Number(base && base[axis]) || 0;
      rotation[axis] = shortestAngle(offset + (Number(rotation[axis]) || 0)) - offset;
    });
  }

  function smooth(value) { var t = clamp01(value); return t * t * (3 - 2 * t); }

  function displayedRotation(view) {
    var t = clamp01(view.progress), anchor = view.rotationAnchor, result = {};
    ["x", "y", "z"].forEach(function(axis) {
      var end = Number(view.rotation[axis]) || 0;
      if (t === 0) { result[axis] = 0; return; }
      if (!anchor) { result[axis] = end * smooth(t); }
      else if (t <= anchor.progress) { result[axis] = anchor[axis] * smooth(t / anchor.progress); }
      else { result[axis] = anchor[axis] + (end - anchor[axis]) * smooth((t - anchor.progress) / (1 - anchor.progress)); }
    });
    return result;
  }

  function dragRotation(view, dx, dy) {
    if (!(view.progress > 0)) { return; }
    var current = displayedRotation(view);
    view.rotation.x += dy; view.rotation.y += dx;
    view.rotationAnchor = { progress: view.progress, x: current.x + dy, y: current.y + dx, z: current.z };
  }

  return {
    displayedRotation: displayedRotation,
    dragRotation: dragRotation,
    shortestAngle: shortestAngle,
    prepareMorphRotation: prepareMorphRotation,
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
      var manual = completion.settled && Number.isFinite(completion.manualProgress);
      var drag = manual ? displayedRotation({progress: completion.manualProgress, rotation: completion.rotation, rotationAnchor: completion.rotationAnchor}) : completion.rotation;
      return {
      x: (manual ? completion.view.x * smooth(completion.manualProgress) : interpolateAngle(completion.startRotation.x, completion.view.x, viewBlend)) + drag.x,
      y: (manual ? completion.view.y * smooth(completion.manualProgress) : interpolateAngle(completion.startRotation.y, completion.view.y, viewBlend)) + drag.y,
      z: (manual ? completion.view.z * smooth(completion.manualProgress) : interpolateAngle(completion.startRotation.z, completion.view.z, viewBlend)) + drag.z,
      rotationDirect: Boolean(completion.rotationDirect),
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
      var rotation = displayedRotation(view);
      return {
        x: rotation.x, y: rotation.y, z: rotation.z, rotationDirect: true,
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
