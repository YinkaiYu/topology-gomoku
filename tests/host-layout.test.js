"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.resolve(__dirname, "..");
const SCRIPT = fs.readFileSync(path.join(ROOT, "app", "assets", "host-layout.js"), "utf8");

function runHostLayout({ embedded = false, toy = false, toyContainer = undefined } = {}) {
  const listeners = {};
  const root = { dataset: {} };
  if (toyContainer !== undefined) {
    root.dataset.toyContainer = toyContainer;
  }
  const self = {};
  const win = {
    self,
    top: embedded ? {} : self,
    toy: toy ? {} : undefined,
    addEventListener(name, listener) {
      listeners[name] = listener;
    }
  };
  vm.runInNewContext(SCRIPT, {
    document: { documentElement: root },
    window: win
  });
  return { root, listeners };
}

test("小红书顶层容器保留宿主顶部留白", () => {
  assert.equal(runHostLayout().root.dataset.hostLayout, "xiaohongshu");
});

test("知乎等 iframe 宿主自动使用紧凑顶部布局", () => {
  assert.equal(runHostLayout({ embedded: true }).root.dataset.hostLayout, "compact");
});

test("Bilibili Toy 及容器状态变化使用紧凑顶部布局", () => {
  const state = runHostLayout({ toy: true });
  assert.equal(state.root.dataset.hostLayout, "compact");

  const changed = runHostLayout();
  changed.root.dataset.toyContainer = "bilibili-app";
  changed.listeners.toycontainerchange();
  assert.equal(changed.root.dataset.hostLayout, "compact");
});

test("紧凑布局只替换宿主顶部留白，仍使用安全区变量", () => {
  const html = fs.readFileSync(path.join(ROOT, "app", "index.html"), "utf8");
  const style = fs.readFileSync(path.join(ROOT, "app", "assets", "style.css"), "utf8");
  assert.ok(html.indexOf("host-layout.js") < html.indexOf("style.css"));
  assert.match(style, /html\[data-host-layout="compact"\]\s*\{[\s\S]*--host-top-inset:\s*var\(--safe-top\)/);
  assert.match(style, /--host-top-inset:\s*max\(68px,\s*calc\(var\(--safe-top\)\s*\+\s*var\(--host-chrome-clearance\)\)\)/);
});

test("宽而矮的嵌入窗口将游戏内容居中并限制最大宽度", () => {
  const style = fs.readFileSync(path.join(ROOT, "app", "assets", "style.css"), "utf8");
  assert.match(
    style,
    /@media \(min-width: 560px\)\s*\{\s*html\[data-host-layout="compact"\] \.app-shell\s*\{[\s\S]*max-width:\s*460px;[\s\S]*margin-inline:\s*auto;/
  );
});
