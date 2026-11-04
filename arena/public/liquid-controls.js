(function arenaLiquidControls() {
  "use strict";

  const Liquid = window.TopologyLiquidRange;
  const ranges = new WeakMap();
  const rangeCancellations = [];
  const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
  const clamp = (value, maximum = 1) => Math.max(0, Math.min(maximum, value));

  // Settings detents and pressed geometry follow app/assets/game.js.
  function detent(value, maximum) {
    if (value <= 0 || value >= maximum) return value;
    const nearest = Math.round(value), distance = value - nearest;
    return nearest + Math.sign(distance) * Math.pow(Math.min(1, Math.abs(distance) * 2), 2.05) * .5;
  }

  function bindSegments(control) {
    const inputs = [...control.querySelectorAll('input[type="radio"]')];
    const labels = inputs.map(input => input.closest("label"));
    const maximum = inputs.length - 1;
    const thumb = document.createElement("i"), lens = document.createElement("span");
    thumb.className = "segmented-glass-thumb";
    lens.className = "segmented-lens-track";
    thumb.setAttribute("aria-hidden", "true");
    for (const label of labels) {
      const copy = document.createElement("b");
      copy.textContent = label.querySelector("span").textContent;
      lens.append(copy);
    }
    thumb.append(lens); control.prepend(thumb);
    control.style.setProperty("--segment-count", inputs.length);
    let progress = inputs.findIndex(input => input.checked), drag = null, frame = 0, dispatching = false, releaseAnimation = null;

    function geometry() {
      const first = labels[0].getBoundingClientRect(), second = labels[1].getBoundingClientRect();
      return { first, step: second.left - first.left, width: first.width };
    }
    function paint(next, delta = 0, pressed = false) {
      progress = next;
      const metrics = geometry();
      if (!metrics.step) return;
      const energy = Math.min(1, Math.abs(delta) / 18);
      const stretch = pressed ? 1.24 + energy * .12 : 1;
      const translation = next * metrics.step - metrics.width * (stretch - 1) * clamp(next / maximum) * .6;
      thumb.style.width = metrics.width + "px";
      thumb.style.translate = translation + "px 0";
      thumb.style.scale = pressed ? stretch + " " + (1.62 + energy * .08) : "1";
      thumb.style.transformOrigin = "left center";
      thumb.style.setProperty("--lens-track-width", control.clientWidth + "px");
      thumb.style.setProperty("--lens-track-offset", (-4 - translation) + "px");
      thumb.style.setProperty("--lens-origin-x", (4 + translation + metrics.width / 2) + "px");
      labels.forEach((label, index) => label.classList.toggle("is-current", index === Math.round(clamp(next, maximum))));
    }
    function settle(target, touch = false, pressed = false) {
      cancelAnimationFrame(frame);
      const startingScale = getComputedStyle(thumb).scale;
      releaseAnimation?.cancel();
      control.classList.remove("is-dragging");
      const from = progress, start = performance.now();
      const duration = Liquid.duration((target - from) / maximum, touch);
      control.classList.toggle("is-settling", pressed && !reducedMotion());
      thumb.style.scale = "1";
      if (pressed && !reducedMotion()) {
        releaseAnimation = thumb.animate([
          { scale: startingScale === "none" ? "1" : startingScale },
          { scale: "1.14 1.06", offset: .28 },
          { scale: ".975 1.025", offset: .66 },
          { scale: "1.012 .99", offset: .84 },
          { scale: "1" }
        ], { duration, easing: "cubic-bezier(.22,.64,.2,1)" });
        releaseAnimation.onfinish = () => control.classList.remove("is-settling");
      }
      if (reducedMotion() || Math.abs(target - from) < .001) { paint(target); return; }
      function tick(now) {
        const elapsed = Math.min(1, (now - start) / duration);
        paint(from + (target - from) * Liquid.glide(elapsed));
        if (elapsed < 1) frame = requestAnimationFrame(tick);
      }
      frame = requestAnimationFrame(tick);
    }
    function select(index) {
      if (inputs[index].disabled) return;
      inputs[index].checked = true;
      inputs[index].focus({ preventScroll: true });
      dispatching = true;
      inputs[index].dispatchEvent(new Event("input", { bubbles: true }));
      inputs[index].dispatchEvent(new Event("change", { bubbles: true }));
      dispatching = false;
    }
    control.addEventListener("change", () => {
      if (!dispatching) settle(inputs.findIndex(input => input.checked));
    });
    control.addEventListener("pointerdown", event => {
      if (drag || event.isPrimary === false || event.button > 0 || inputs.every(input => input.disabled)) return;
      cancelAnimationFrame(frame);
      releaseAnimation?.cancel();
      control.classList.remove("is-settling");
      const rect = thumb.getBoundingClientRect();
      const pressed = event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom;
      drag = { id: event.pointerId, startX: event.clientX, lastX: event.clientX, start: progress, moved: false, pressed, touch: event.pointerType !== "mouse", metrics: geometry() };
      control.classList.toggle("is-dragging", pressed);
      control.setPointerCapture(event.pointerId);
      paint(progress, 0, pressed);
      event.preventDefault();
    });
    control.addEventListener("pointermove", event => {
      if (!drag || drag.id !== event.pointerId) return;
      const delta = event.clientX - drag.startX;
      drag.moved = drag.moved || Math.abs(delta) > 3;
      if (!drag.moved) return;
      const raw = drag.start + delta / drag.metrics.step;
      const bounded = Math.max(-.24, Math.min(maximum + .24, raw));
      paint(detent(bounded, maximum), event.clientX - drag.lastX, drag.pressed);
      drag.lastX = event.clientX;
      event.preventDefault();
    });
    function finish(event, cancelled = false) {
      if (!drag || (event.pointerId !== undefined && drag.id !== event.pointerId)) return;
      const finished = drag;
      const location = (event.clientX - finished.metrics.first.left - finished.metrics.width / 2) / finished.metrics.step;
      const target = cancelled ? inputs.findIndex(input => input.checked) : Math.round(clamp(finished.moved ? progress : location, maximum));
      drag = null;
      if (control.hasPointerCapture(finished.id)) control.releasePointerCapture(finished.id);
      if (!cancelled) select(target);
      settle(target, finished.touch, finished.pressed);
      event.preventDefault?.();
    }
    control.addEventListener("pointerup", event => finish(event));
    control.addEventListener("pointercancel", event => finish(event, true));
    control.addEventListener("lostpointercapture", event => finish(event, true));
    window.addEventListener("blur", event => finish(event, true));
    document.addEventListener("visibilitychange", event => { if (document.hidden) finish(event, true); });
    control.addEventListener("click", event => { if (event.detail > 0) event.preventDefault(); });
    new ResizeObserver(() => {
      if (drag) finish({ pointerId: drag.id }, true);
      else paint(progress);
    }).observe(control);
    paint(progress);
  }

  function bindRange(input) {
    const control = document.createElement("div"), track = document.createElement("span"), thumb = document.createElement("i"), lens = document.createElement("span");
    control.className = "liquid-range";
    track.className = "dimension-track";
    thumb.className = "dimension-glass-thumb";
    lens.className = "dimension-lens-track";
    track.setAttribute("aria-hidden", "true"); thumb.setAttribute("aria-hidden", "true");
    input.before(control); control.append(track, input, thumb); thumb.append(lens);
    input.classList.add("liquid-range-input");
    const minimum = () => Number(input.min) || 0;
    const span = () => Math.max(0, Number(input.max) - minimum());
    const normalize = () => span() ? (Number(input.value) - minimum()) / span() : 0;
    let frame = 0, dispatching = false, progress = normalize(), target = progress, busy = false, previousSpan = span();
    // Shared pointer handling uses normalized progress while Arena retains its
    // original percentage/ply values and accessible DOM input.
    const normalizedInput = {
      get value() { return String(normalize()); },
      set value(next) { input.value = String(minimum() + Number(next) * span()); },
      get disabled() { return input.disabled; },
      set disabled(disabled) { input.disabled = disabled; },
      focus(options) { input.focus(options); },
      addEventListener() { /* Native input and keyboard events are adapted below. */ }
    };
    function emit(next) {
      progress = clamp(next);
      binding.sync(progress, input.disabled);
      dispatching = true;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      dispatching = false;
    }
    function change(next, animated, touch) {
      cancelAnimationFrame(frame);
      frame = 0;
      target = clamp(next);
      if (animated && input.step !== "any" && span()) {
        const step = Number(input.step) || 1;
        target = clamp(Math.round(target * span() / step) * step / span());
      }
      if (!animated || reducedMotion()) { emit(target); return; }
      const from = progress, start = performance.now(), duration = Liquid.duration(target - from, touch);
      function tick(now) {
        if (input.disabled || !control.getClientRects().length) { cancel(); return; }
        const elapsed = Math.min(1, (now - start) / duration);
        emit(from + (target - from) * Liquid.glide(elapsed));
        if (elapsed < 1) frame = requestAnimationFrame(tick);
        else frame = 0;
      }
      frame = requestAnimationFrame(tick);
    }
    const binding = Liquid.bind({ control, input: normalizedInput, thumb,
      isEnabled: () => span() > 0 && control.getClientRects().length > 0,
      onBusy(value) {
        busy = value;
        if (!value && !frame) {
          progress = target = normalize();
          binding.sync(progress, input.disabled || span() === 0);
        }
      }, onChange: change
    });
    function sync() {
      if (dispatching) return;
      cancelAnimationFrame(frame);
      frame = 0;
      if (previousSpan !== span() || input.disabled) binding.cancel();
      previousSpan = span();
      progress = target = normalize();
      binding.sync(progress, input.disabled || span() === 0);
    }
    function cancel() {
      cancelAnimationFrame(frame);
      frame = 0;
      binding.cancel();
      progress = target = normalize();
      binding.sync(progress, input.disabled || span() === 0);
    }
    input.addEventListener("input", () => { if (!dispatching) sync(); });
    input.addEventListener("keydown", event => {
      if (input.disabled || !span()) return;
      const steps = { ArrowLeft: -1, ArrowDown: -1, ArrowRight: 1, ArrowUp: 1, PageDown: -10, PageUp: 10 };
      let next;
      if (event.key === "Home") next = 0;
      else if (event.key === "End") next = 1;
      else if (Object.hasOwn(steps, event.key)) next = target + steps[event.key] * (Number(input.step) || 1) / span();
      else return;
      binding.cancel(); change(next, true, false); event.preventDefault();
    });
    new ResizeObserver(() => {
      if (busy || !control.getClientRects().length) cancel();
      binding.sync(progress, input.disabled || span() === 0);
    }).observe(control);
    ranges.set(input, sync); rangeCancellations.push(cancel); sync();
  }

  document.querySelectorAll(".segmented").forEach(bindSegments);
  document.querySelectorAll('input[type="range"]').forEach(bindRange);
  window.ArenaLiquidControls = {
    syncRange(input) { ranges.get(input)?.(); },
    cancelRanges() { rangeCancellations.forEach(cancel => cancel()); }
  };
})();
