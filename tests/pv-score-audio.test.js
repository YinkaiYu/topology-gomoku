import assert from "node:assert/strict";
import test from "node:test";

import { spatializeWave } from "../video/footsteps-return/scripts/score-audio.mjs";

function channelDb(sample) {
  return 20 * Math.log10(Math.max(Math.abs(sample), 1e-12));
}

test("PCM spatializer consumes normalized pan automation and returns to the declared static stage", () => {
  const wave = {
    sampleRate: 10,
    frameCount: 30,
    channels: [new Float32Array(30).fill(0.25), new Float32Array(30).fill(0.25)]
  };
  const spatialized = spatializeWave(wave, {
    staticPosition: 0,
    panAutomation: [
      { time: 1, value: 0.1 },
      { time: 2, value: 0.9 }
    ]
  });

  assert.ok(channelDb(spatialized.channels[0][10]) - channelDb(spatialized.channels[1][10]) > 8,
    "the first automation point must be audibly left-weighted");
  assert.ok(channelDb(spatialized.channels[0][20]) - channelDb(spatialized.channels[1][20]) < -8,
    "the last automation point must be audibly right-weighted");
  assert.ok(Math.abs(spatialized.channels[0][5] - spatialized.channels[1][5]) < 1e-7);
  assert.ok(spatialized.channels[0][9] > spatialized.channels[1][9],
    "the automation entrance must ramp toward the first point instead of jumping in one sample");
  assert.ok(spatialized.channels[1][21] > spatialized.channels[0][21],
    "the automation exit must ramp back toward the static stage instead of jumping in one sample");
  assert.ok(Math.abs(spatialized.channels[0][25] - spatialized.channels[1][25]) < 1e-7,
    "automation must not pin the rest of the part to its final point");
});
