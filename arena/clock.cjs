"use strict";

function remaining(clock, now) {
  const result = { ...clock.remainingMs };
  if (clock.active && clock.runningSince !== null) {
    result[clock.active] = Math.max(0, result[clock.active] - Math.max(0, now - clock.runningSince));
  }
  return result;
}
function snapshot(clock, now) {
  if (!clock) return null;
  return {
    initialMs: clock.initialMs, incrementMs: clock.incrementMs,
    remainingMs: remaining(clock, now), active: clock.active,
    serverNow: clock.active ? now : null,
    deadline: clock.active ? clock.runningSince + clock.remainingMs[clock.active] : null
  };
}
function freeze(clock, now) {
  if (!clock) return;
  clock.remainingMs = remaining(clock, now);
  clock.active = null;
  clock.runningSince = null;
}
function start(clock, role, now) {
  if (!clock) return;
  clock.active = role;
  clock.runningSince = now;
}
function moved(clock, role, now) {
  if (!clock) return;
  freeze(clock, now);
  clock.remainingMs[role] += clock.incrementMs;
  start(clock, role === "black" ? "white" : "black", now);
}
module.exports = { remaining, snapshot, freeze, start, moved };
