(function attachLiquidRange(root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  if (root) { root.TopologyLiquidRange = api; }
}(typeof globalThis !== "undefined" ? globalThis : this, function createLiquidRange() {
  "use strict";

  function clamp(value) { return Math.max(0, Math.min(1, Number(value) || 0)); }

  // Same distance-sensitive timing and cubic-bezier as the settings slider.
  function duration(distance, touch) {
    return Math.round((touch ? 660 : 540) + clamp(Math.abs(distance)) * (touch ? 280 : 200));
  }

  function glide(progress) {
    var x = clamp(progress);
    if (x === 0 || x === 1) { return x; }
    function cubic(t, a, b) {
      return 3 * (1 - t) * (1 - t) * t * a + 3 * (1 - t) * t * t * b + t * t * t;
    }
    var low = 0;
    var high = 1;
    for (var i = 0; i < 20; i += 1) {
      var t = (low + high) / 2;
      if (cubic(t, 0.32, 0.2) < x) { low = t; } else { high = t; }
    }
    return cubic((low + high) / 2, 0.05, 1.13);
  }

  function bind(options) {
    var control = options.control;
    var input = options.input;
    var thumb = options.thumb;
    var host = control.ownerDocument.defaultView;
    var drag = null;
    var value = clamp(input.value);

    function paint(next) {
      value = clamp(next);
      input.value = String(value);
      control.style.setProperty("--view-progress", String(value));
      // The refracted track stays anchored to the real track while the lens moves.
      var width = control.clientWidth;
      var travel = Math.max(1, width - thumb.offsetWidth);
      thumb.style.setProperty("--lens-track-width", travel + "px");
      thumb.style.setProperty("--lens-track-offset", (thumb.offsetWidth / 2 - travel * value) + "px");
      thumb.style.setProperty("--lens-origin-x", (travel * value) + "px");
    }

    function clearPress() {
      control.classList.remove("is-dragging");
      thumb.style.removeProperty("scale");
    }

    function releaseCapture(pointerId) {
      try { control.releasePointerCapture(pointerId); } catch (error) { /* Optional capture. */ }
    }

    function cancel() {
      if (!drag) { return; }
      var pointerId = drag.pointerId;
      drag = null;
      clearPress();
      releaseCapture(pointerId);
      options.onBusy(false);
    }

    function enabled() { return !input.disabled && options.isEnabled(); }

    control.addEventListener("pointerdown", function begin(event) {
      if (!enabled() || drag || event.isPrimary === false || event.button > 0) { return; }
      var rect = control.getBoundingClientRect();
      var knob = thumb.getBoundingClientRect();
      var pressed = event.clientX >= knob.left && event.clientX <= knob.right
        && event.clientY >= knob.top && event.clientY <= knob.bottom;
      drag = {
        pointerId: event.pointerId,
        startX: event.clientX,
        lastX: event.clientX,
        startValue: value,
        moved: false,
        pressed: pressed,
        touch: event.pointerType === "touch" || event.pointerType === "pen",
        left: rect.left + thumb.offsetWidth / 2,
        travel: Math.max(1, rect.width - thumb.offsetWidth)
      };
      input.focus({ preventScroll: true });
      try { control.setPointerCapture(event.pointerId); } catch (error) { /* Window handlers are the fallback. */ }
      options.onBusy(true);
      options.onChange(value, false, drag.touch); // Interrupt a glide at its visible position.
      control.classList.toggle("is-dragging", pressed);
      if (pressed) { thumb.style.scale = "1.24 1.48"; }
      event.preventDefault();
    });

    host.addEventListener("pointermove", function move(event) {
      if (!drag || drag.pointerId !== event.pointerId) { return; }
      if (!enabled()) { cancel(); return; }
      var delta = event.clientX - drag.startX;
      drag.moved = drag.moved || Math.abs(delta) > 3;
      if (!drag.moved) { return; }
      var next = drag.pressed
        ? drag.startValue + delta / drag.travel
        : (event.clientX - drag.left) / drag.travel;
      if (drag.pressed) {
        var energy = Math.min(1, Math.abs(event.clientX - drag.lastX) / 18);
        thumb.style.scale = (1.24 + energy * 0.12) + " " + (1.48 + energy * 0.08);
      }
      drag.lastX = event.clientX;
      options.onChange(clamp(next), false, drag.touch);
      paint(next);
      event.preventDefault();
    }, { passive: false });

    host.addEventListener("pointerup", function finish(event) {
      if (!drag || drag.pointerId !== event.pointerId) { return; }
      if (!enabled()) { cancel(); return; }
      var finished = drag;
      var next = finished.moved || finished.pressed ? value : clamp((event.clientX - finished.left) / finished.travel);
      drag = null;
      clearPress();
      releaseCapture(event.pointerId);
      // Commit while still busy: AI cannot slip into the handoff to a glide.
      options.onChange(next, true, finished.touch);
      options.onBusy(false);
      event.preventDefault();
    });
    host.addEventListener("pointercancel", function abort(event) {
      if (drag && drag.pointerId === event.pointerId) { cancel(); }
    });
    control.addEventListener("lostpointercapture", function lost(event) {
      if (drag && drag.pointerId === event.pointerId) { cancel(); }
    });
    host.addEventListener("blur", cancel);
    control.ownerDocument.addEventListener("visibilitychange", function hide() {
      if (control.ownerDocument.hidden) { cancel(); }
    });

    input.addEventListener("keydown", function keyboard(event) {
      if (!enabled()) { return; }
      var keys = { ArrowLeft: -0.05, ArrowDown: -0.05, ArrowRight: 0.05, ArrowUp: 0.05, PageDown: -0.1, PageUp: 0.1 };
      var target;
      if (event.key === "Home") { target = 0; }
      else if (event.key === "End") { target = 1; }
      else if (Object.prototype.hasOwnProperty.call(keys, event.key)) { target = value + keys[event.key]; }
      else { return; }
      cancel();
      options.onChange(clamp(target), true, false);
      event.preventDefault();
    });
    // Native accessibility increment/decrement remains usable without a pointer.
    input.addEventListener("input", function accessibleInput() {
      if (enabled()) { options.onChange(clamp(input.value), true, false); }
    });

    return {
      cancel: cancel,
      sync: function sync(next, disabled) {
        input.disabled = disabled;
        control.classList.toggle("is-disabled", disabled);
        if (disabled) { cancel(); }
        paint(next);
      }
    };
  }

  return { bind: bind, duration: duration, glide: glide };
}));
