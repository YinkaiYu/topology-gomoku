import { compositionTiming, voiceoverSchedule } from "./captions.js";

const freezeScene = (scene) => Object.freeze({ ...scene, narrationCueIds: Object.freeze(scene.narrationCueIds), transition: Object.freeze(scene.transition) });
const freezeCue = (cue) => Object.freeze(cue);

export const masterTimeline = Object.freeze({
  id: "footsteps-return-master",
  duration: compositionTiming.duration,
  scenes: Object.freeze(compositionTiming.scenes.map(freezeScene)),
  narration: Object.freeze(voiceoverSchedule.map(freezeCue)),
  audio: Object.freeze([freezeCue({ id: "score-master", role: "score", start: 0, duration: compositionTiming.duration })])
});
