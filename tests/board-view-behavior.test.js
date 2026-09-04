"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const ViewLogic = require("../app/assets/board-view-logic.js");

test("转换期间开始的按下手势不会在松手时重新获得落子资格", () => {
  const cellAvailable = true;
  const eligibleAtDown = ViewLogic.placementEligibleAtDown(false);
  assert.equal(ViewLogic.shouldPlaceOnRelease(eligibleAtDown, false, cellAvailable), false);
});

test("稳定三维视角的短点击可落子，拖动手势不会落子", () => {
  const eligibleAtDown = ViewLogic.placementEligibleAtDown(true);
  assert.equal(ViewLogic.shouldPlaceOnRelease(eligibleAtDown, false, true), true);
  assert.equal(ViewLogic.shouldPlaceOnRelease(eligibleAtDown, true, true), false);
  assert.equal(ViewLogic.shouldPlaceOnRelease(eligibleAtDown, false, false), false);
});

test("AI 在视角转换或滑块拖动时延后", () => {
  assert.equal(ViewLogic.shouldDelayAi({ transitioning: true, scrubbing: false }), true);
  assert.equal(ViewLogic.shouldDelayAi({ transitioning: false, scrubbing: true }), true);
  assert.equal(ViewLogic.shouldDelayAi({ transitioning: false, scrubbing: false }), false);
});

test("终局形变从中间进度连续插值到三维端点", () => {
  assert.equal(ViewLogic.interpolateProgress(0.25, 0), 0.25);
  assert.equal(ViewLogic.interpolateProgress(0.25, 0.5), 0.625);
  assert.equal(ViewLogic.interpolateProgress(0.75, 1), 1);
});
