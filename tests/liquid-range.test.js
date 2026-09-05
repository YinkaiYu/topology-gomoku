"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const LiquidRange = require("../app/assets/liquid-range.js");

function element(rect = { left: 0, top: 0, width: 228, height: 44 }) {
  const listeners = {};
  const classes = new Set();
  return {
    listeners, value: "0", disabled: false, clientWidth: rect.width, offsetWidth: rect.width,
    style: { setProperty(key, value) { this[key] = value; }, removeProperty(key) { delete this[key]; } },
    classList: { toggle(key, on) { if (on) { classes.add(key); } else { classes.delete(key); } }, remove(key) { classes.delete(key); }, contains(key) { return classes.has(key); } },
    addEventListener(type, fn) { (listeners[type] ||= []).push(fn); },
    emit(type, extra = {}) {
      const event = { pointerId: 1, button: 0, clientX: 14, clientY: 22, pointerType: "mouse", preventDefault() {}, ...extra };
      for (const fn of listeners[type] || []) { fn(event); }
    },
    getBoundingClientRect() { return { ...rect, right: rect.left + rect.width, bottom: rect.top + rect.height }; },
    focus() {}, setPointerCapture(id) { this.capture = id; }, releasePointerCapture() { this.capture = null; }
  };
}

function fixture() {
  const host = element();
  const document = element();
  document.defaultView = host;
  const control = element();
  control.ownerDocument = document;
  const input = element();
  const thumb = element({ left: 0, top: 11, width: 28, height: 22 });
  const events = [];
  let range;
  let enabled = true;
  range = LiquidRange.bind({
    control, input, thumb, isEnabled: () => enabled,
    onBusy: value => events.push(["busy", value]),
    onChange: (value, animate, touch) => {
      events.push(["change", value, animate, touch]);
      if (!animate) { range.sync(value, false); }
    }
  });
  range.sync(0, false);
  return { host, document, control, input, thumb, events, range, disable() { enabled = false; range.sync(0, true); } };
}

test("直接按住玻璃体才鼓起，拖动逐帧跟手、越界钳制，释放清除指针与形变", () => {
  const f = fixture();
  f.control.emit("pointerdown", { pointerType: "touch" });
  assert.equal(f.control.capture, 1);
  assert.equal(f.control.classList.contains("is-dragging"), true);
  assert.equal(f.thumb.style.scale, "1.24 1.48");
  f.host.emit("pointermove", { clientX: 114 });
  assert.equal(f.input.value, "0.5");
  assert.equal(f.thumb.style["--lens-track-width"], "200px");
  assert.equal(f.thumb.style["--lens-track-offset"], "-86px");
  assert.equal(f.thumb.style["--lens-origin-x"], "100px");
  assert.ok(parseFloat(f.thumb.style.scale) > 1);
  f.host.emit("pointermove", { clientX: 500 });
  assert.equal(f.input.value, "1");
  f.host.emit("pointerup", { clientX: 500 });
  assert.equal(f.control.capture, null);
  assert.equal(f.control.classList.contains("is-dragging"), false);
  assert.equal(f.thumb.style.scale, undefined);
  assert.deepEqual(f.events.slice(-2), [["change", 1, true, true], ["busy", false]]);
});

test("点击轨道只提交滑行目标，不跳位、不伪造按压", () => {
  const f = fixture();
  f.control.emit("pointerdown", { clientX: 164 });
  assert.equal(f.control.classList.contains("is-dragging"), false);
  assert.equal(f.thumb.style.scale, undefined);
  assert.equal(f.input.value, "0");
  f.host.emit("pointerup", { clientX: 164 });
  assert.equal(f.input.value, "0", "visual value stays at start until the animation paints it");
  assert.deepEqual(f.events.slice(-2), [["change", 0.75, true, false], ["busy", false]]);
});

test("轨道拖动不产生玻璃按压；非主指针不能接管或结束手势", () => {
  const f = fixture();
  f.control.emit("pointerdown", { clientX: 114 });
  f.control.emit("pointerdown", { pointerId: 2, isPrimary: false });
  f.host.emit("pointermove", { pointerId: 2, clientX: 214 });
  f.host.emit("pointerup", { pointerId: 2 });
  assert.equal(f.control.capture, 1);
  assert.equal(f.input.value, "0");
  f.host.emit("pointermove", { clientX: 154 });
  assert.equal(f.input.value, "0.7");
  assert.equal(f.thumb.style.scale, undefined);
  f.host.emit("pointerup", { clientX: 154 });
  assert.deepEqual(f.events.at(-1), ["busy", false]);
});

test("取消、丢失捕获、窗口失焦、页面隐藏及禁用都释放忙碌状态", () => {
  for (const reason of ["pointercancel", "lostpointercapture", "blur", "hidden", "disabled", "navigation"]) {
    const f = fixture();
    f.control.emit("pointerdown");
    if (reason === "hidden") { f.document.hidden = true; f.document.emit("visibilitychange"); }
    else if (reason === "disabled") { f.disable(); }
    else if (reason === "navigation") { f.range.cancel(); }
    else { (reason === "lostpointercapture" ? f.control : f.host).emit(reason); }
    assert.deepEqual(f.events.at(-1), ["busy", false], reason);
    assert.equal(f.thumb.style.scale, undefined, reason);
    const count = f.events.length;
    f.host.emit("pointerup");
    assert.equal(f.events.length, count, "late pointerup must not commit after " + reason);
  }
});

test("键盘、读屏增减与禁用状态可用，停靠值始终在范围内", () => {
  const f = fixture();
  for (const [key, target] of [["ArrowRight", 0.05], ["PageUp", 0.1], ["End", 1], ["Home", 0], ["ArrowLeft", 0]]) {
    f.input.emit("keydown", { key });
    assert.deepEqual(f.events.at(-1), ["change", target, true, false]);
  }
  f.input.value = "0.25";
  f.input.emit("input");
  assert.deepEqual(f.events.at(-1), ["change", 0.25, true, false]);
  f.disable();
  const count = f.events.length;
  f.input.emit("keydown", { key: "End" });
  f.control.emit("pointerdown");
  assert.equal(f.events.length, count);
});

test("惯性节奏与设置一致：距离越长、触摸输入越重；首尾精确且只有一次小回弹", () => {
  assert.equal(LiquidRange.duration(1, false), 740);
  assert.ok(LiquidRange.duration(1, true) > LiquidRange.duration(1, false));
  assert.ok(LiquidRange.duration(0.2, false) < LiquidRange.duration(1, false));
  assert.equal(LiquidRange.glide(0), 0);
  assert.equal(LiquidRange.glide(1), 1);
  assert.ok(LiquidRange.glide(220 / 740) < 0.8);
  const values = Array.from({ length: 1001 }, (_, i) => LiquidRange.glide(i / 1000));
  assert.ok(Math.max(...values) > 1 && Math.max(...values) < 1.03);
  let reversals = 0;
  for (let i = 2; i < values.length; i += 1) {
    if (values[i] < values[i - 1] && values[i - 1] >= values[i - 2]) { reversals += 1; }
  }
  assert.equal(reversals, 1);
});

test("视角两端复用上图下字工具按钮，不恢复玻璃底板或选中底色", () => {
  const fs = require("node:fs");
  const html = fs.readFileSync(require.resolve("../app/index.html"), "utf8");
  const css = fs.readFileSync(require.resolve("../app/assets/style.css"), "utf8");
  // Keep the original dev icons: a nine-cell board and a cylinder.
  assert.ok(html.includes('d="M4 4h16v16H4zM9.33 4v16M14.67 4v16M4 9.33h16M4 14.67h16"'));
  assert.ok(html.includes('d="M5 6c0-1.7 3.1-3 7-3s7 1.3 7 3-3.1 3-7 3-7-1.3-7-3Zm0 0v12c0 1.7 3.1 3 7 3s7-1.3 7-3V6"'));
  for (const [id, label] of [["viewFlatButton", "二维"], ["viewSpatialButton", "三维"]]) {
    const button = html.match(new RegExp('<button class="tool-button dimension-endpoint" id="' + id + '"[^>]*>([\\s\\S]*?)</button>'));
    assert.ok(button, id);
    assert.match(button[1], new RegExp('<svg[^>]*aria-hidden="true"[\\s\\S]*</svg>\\s*<span>' + label + '</span>'));
  }
  assert.match(css, /\.tool-button\.dimension-endpoint\s*\{[^}]*border: 0;[^}]*background: transparent;[^}]*box-shadow: none;/);
  assert.match(css, /\.tool-button\.dimension-endpoint\[aria-pressed="true"\]\s*\{\s*color: var\(--ink\);\s*\}/);
  assert.match(css, /\.tool-button\.dimension-endpoint:active:not\(:disabled\)\s*\{[^}]*background: transparent;/);
  const lensScale = css.match(/\.dimension-lens-track\s*\{[^}]*transform: scale\(([\d.]+), ([\d.]+)\)/);
  assert.ok(lensScale);
  assert.ok(Number(lensScale[2]) * 1.56 < 0.55, "pressed refraction must stay narrow after the lens expands");
  assert.match(css, /\.dimension-range\.is-dragging \.dimension-track\s*\{[^}]*mask-image: linear-gradient/);
});

test("终局复盘行按上一步、复盘或定局、下一步排列，键盘顺序与视觉顺序一致", () => {
  const html = require("node:fs").readFileSync(require.resolve("../app/index.html"), "utf8");
  const row = html.match(/id="endgameReviewTools"[^>]*>([\s\S]*?)<\/div>/)[1];
  assert.deepEqual(Array.from(row.matchAll(/<button[^>]*id="([^"]+)"/g), match => match[1]), [
    "reviewPreviousButton", "reviewToggleButton", "reviewNextButton"
  ]);
});

test("视角与终局两行工具共享三列、列间距及行高，不单独限宽或偏移", () => {
  const css = require("node:fs").readFileSync(require.resolve("../app/assets/style.css"), "utf8");
  for (const selector of ["dimension-control", "endgame-review-tools", "game-tools"]) {
    const rule = css.match(new RegExp('\\.' + selector + '\\s*\\{([^}]+)\\}'))[1];
    assert.match(rule, /grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/);
    assert.match(rule, /column-gap: var\(--game-control-column-gap\)/);
  }
  const dimension = css.match(/\.dimension-control\s*\{([^}]+)\}/)[1];
  assert.match(dimension, /width: 100%;/);
  assert.match(dimension, /flex: 0 0 var\(--game-control-row-size\);/);
  assert.match(dimension, /margin: 0;\s*padding: 0;/);
  assert.match(css, /#viewFlatButton\s*\{ grid-column: 1; \}/);
  assert.match(css, /#viewSpatialButton\s*\{ grid-column: 3; \}/);
});
