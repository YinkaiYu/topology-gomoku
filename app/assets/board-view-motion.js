(function attachBoardViewMotion(root, factory) {
  "use strict";
  var common = typeof module === "object" && module.exports;
  var api = factory(
    common ? require("./topology-morph.js") : root.TopologyMorph,
    common ? require("./board-view-logic.js") : root.TopologyBoardViewLogic,
    common ? require("./liquid-range.js") : root.TopologyLiquidRange
  );
  if (common) { module.exports = api; }
  if (root) { root.TopologyBoardViewMotion = api; }
})(typeof globalThis !== "undefined" ? globalThis : this, function(Morph, Logic, Liquid) {
  "use strict";

  function create() {
    return {
      progress: 0, target: 0, startProgress: 0, startedAt: 0, duration: 0,
      transitioning: false, scrubbing: false, dragging: false,
      rotation: { x: 0, y: 0, z: 0 }, elastic: { x: 0, y: 0 },
      completion: null
    };
  }

  function setProgress(view, value, time, animate, touch) {
    var target = Morph.clamp01(Number(value) || 0);
    view.startProgress = view.progress;
    view.target = target;
    view.startedAt = time;
    view.duration = animate ? Liquid.duration(target - view.progress, touch) : 0;
    view.transitioning = Boolean(animate && Math.abs(target - view.progress) > 0.001);
    if (!view.transitioning) { view.progress = target; }
  }

  function finish(view, time, presentation, targetView) {
    var pose = view.displayedOrientation || Logic.interactiveOrientation(view, time);
    view.completion = {
      startedAt: time, startProgress: view.progress, settled: false,
      startRotation: { x: pose.x, y: pose.y, z: pose.z },
      startWobble: { x: pose.wobbleX, y: pose.wobbleY },
      presentation: presentation, view: targetView || { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 }, elastic: { x: 0, y: 0 }
    };
    view.transitioning = false;
    view.scrubbing = false;
  }

  function tick(view, time) {
    var completion = view.completion;
    if (completion && !completion.settled) {
      view.progress = Logic.interpolateProgress(completion.startProgress,
        Morph.spring(Morph.clamp01((time - completion.startedAt - 80) / 2550)));
      if (time - completion.startedAt >= 3000) {
        view.progress = 1;
        view.target = 1;
        completion.settled = true;
      }
      return true;
    }
    if (!view.transitioning) { return false; }
    var progress = Morph.clamp01((time - view.startedAt) / view.duration);
    view.progress = Morph.clamp01(view.startProgress + (view.target - view.startProgress) * Liquid.glide(progress));
    if (progress >= 1) {
      view.progress = view.target;
      view.transitioning = false;
    }
    return true;
  }

  function orientation(view, time) {
    var completion = view.completion;
    if (!completion) { return Logic.interactiveOrientation(view, time); }
    var elapsed = time - completion.startedAt;
    var blend = completion.settled ? view.progress : Morph.smooth((elapsed - 100) / 1850);
    var progress = Morph.clamp01((elapsed - 80) / 2550);
    var scale = 1 + Math.sin(progress * Math.PI * 2.35) * Math.pow(1 - progress, 1.85) * 0.048;
    return Logic.completionOrientation(completion, blend, scale, 0, false, Morph, time);
  }

  function busy(view) {
    return Logic.shouldDelayAi(view) || Boolean(view && view.completion && !view.completion.settled);
  }

  return { create: create, setProgress: setProgress, finish: finish, tick: tick, orientation: orientation, busy: busy };
});
