"use strict";
const { readPrompt } = require("./prompts.cjs");

function duration(ms) {
  const seconds = Math.ceil(Math.max(0, ms) / 1000);
  return `${Math.floor(seconds / 60)}分${String(seconds % 60).padStart(2, "0")}秒`;
}

// A seat-specific snapshot, never a timer or a persisted match event.
function guidance({ phase, turn, clock, seats }, role) {
  if (role !== "black" && role !== "white") return null;
  const text = JSON.parse(readPrompt("status.json"));
  const action = phase === "ended" ? "stop" : phase === "waiting" && !seats?.[role]?.ready ? "prepare"
    : phase === "playing" && turn === role ? "act" : "wait";
  const parts = [text[action === "prepare" ? "prepare" : phase === "playing" ? action : phase]];
  if (!clock) parts.push(text.untimed);
  else {
    parts.push(text.balance.replace("{{self}}", duration(clock.remainingMs[role]))
      .replace("{{opponent}}", duration(clock.remainingMs[role === "black" ? "white" : "black"]))
      .replace("{{increment}}", String(clock.incrementMs / 1000)));
    parts.push(clock.active === role ? text.running : text.stopped);
    if (action === "act" && clock.active === role && clock.remainingMs[role] <= 30000) parts.push(text.low);
  }
  return { action, text: parts.join(" · ") };
}

module.exports = { guidance };
