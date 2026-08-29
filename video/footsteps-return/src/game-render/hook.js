(function installPvRenderHook() {
  "use strict";
  var control = window.__PV_CONTROL__ = {
    mode: "setup", morph: null, rotation: { x: 0, y: 0, z: 0 }, frozen: false,
    queuedFrames: [], suppressedTextCalls: 0, visiblePromptCalls: 0, lessonStrokeCalls: 0, paperDots: 0
  };
  var prompts = new Set([
    "传统的五子棋","就是把五颗子","连成一条线","好无趣","好无聊",
    "从右侧开始","走到边界","越过右边，从左边回来","两侧其实相接","补上第五颗","再试一条斜线","斜着走向右边","越界后从左边接回","方向没有改变","斜线也能五连",
    "先从下方开始","从下方开始","走到下边界","越过下边，从上边回来","上下也没有尽头","上下没有尽头","再走一条斜线","先越过上边","再越过左边","两次跨界仍是同一条线",
    "越界后，上下镜像","镜像后仍是同一条线","斜着走到右边","越界后方向翻转","折向的两段彼此相连","这一组边直接相接","先越过相接的边","再越过翻转的边","一环一扭仍能连成线",
    "越界后，左右镜像","下边通向倒影","越过上边后翻转","接着越过左边再翻转","两次倒映仍在同一条线上","从上方开始","走向上边界","上边转向左边","转弯后，线仍连续","再靠近顶点","落在两边交会处","路径沿邻边转向","穿过顶点仍然连续"
  ]);
  var nativeRaf = window.requestAnimationFrame.bind(window);
  var nativeSetTimeout = window.setTimeout.bind(window);
  window.setTimeout = function (callback, delay) {
    if (control.frozen) return -1;
    return nativeSetTimeout.apply(window, arguments);
  };
  window.requestAnimationFrame = function (callback) {
    if (!control.frozen) return nativeRaf(callback);
    control.queuedFrames.push(callback);
    return control.queuedFrames.length;
  };
  control.flush = function (time) {
    var callbacks = control.queuedFrames.splice(0);
    callbacks.forEach(function (callback) { callback(time); });
  };
  var nativeFillRect = CanvasRenderingContext2D.prototype.fillRect;
  CanvasRenderingContext2D.prototype.fillRect = function (x, y, width, height) {
    if (control.mode !== "setup" && this.fillStyle === "rgba(81, 75, 65, 0.035)" && width === 0.65 && height === 0.65) { control.paperDots += 1; return; }
    return nativeFillRect.apply(this, arguments);
  };
  ["fillText", "strokeText"].forEach(function (name) {
    var native = CanvasRenderingContext2D.prototype[name];
    CanvasRenderingContext2D.prototype[name] = function (text) {
      if (control.mode === "helper" && prompts.has(String(text))) { control.suppressedTextCalls += 1; return; }
      if (prompts.has(String(text))) control.visiblePromptCalls += 1;
      return native.apply(this, arguments);
    };
  });
  var nativeStroke = CanvasRenderingContext2D.prototype.stroke;
  CanvasRenderingContext2D.prototype.stroke = function () {
    if (control.mode === "helper" && (this.strokeStyle === "#3f8c87" || this.strokeStyle === "#c79244") && this.getLineDash().length) control.lessonStrokeCalls += 1;
    return nativeStroke.apply(this, arguments);
  };
  var morphValue;
  Object.defineProperty(window, "TopologyMorph", {
    configurable: true,
    get: function () { return morphValue; },
    set: function (value) {
      var nativeSpring = value.spring;
      value.spring = function (progress) { return control.morph === null ? nativeSpring(progress) : control.morph; };
      ["project", "projectPoint"].forEach(function (name) {
        var native = value[name];
        value[name] = function () {
          var args = Array.from(arguments); var index = name === "project" ? 5 : 4;
          var orientation = Object.assign({}, args[index] || {}, control.rotation, { wobbleX: 0, wobbleY: 0 });
          args[index] = orientation; return native.apply(value, args);
        };
      });
      morphValue = value;
    }
  });
  var NativeParams = window.URLSearchParams;
  window.URLSearchParams = function (input) { return new NativeParams(input === window.location.search ? "?dev=1" : input); };
  window.URLSearchParams.prototype = NativeParams.prototype;
}());
