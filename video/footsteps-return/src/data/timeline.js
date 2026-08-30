import { compositionTiming, voiceoverSchedule } from "./captions.js";

const freezeScene = (scene) => Object.freeze({ ...scene, narrationCueIds: Object.freeze(scene.narrationCueIds), transition: Object.freeze(scene.transition) });
const freezeCue = (cue) => Object.freeze(cue);

export const masterTimeline = Object.freeze({
  id: "footsteps-return-master",
  duration: compositionTiming.duration,
  scenes: Object.freeze(compositionTiming.scenes.map(freezeScene)),
  narration: Object.freeze(voiceoverSchedule.map(freezeCue)),
  audio: Object.freeze([
    freezeCue({ id: "narration-bus", role: "narration", start: 0.42, duration: 208.7, cueCount: 21, manifest: "audio/mix.json" }),
    freezeCue({ id: "score-master", role: "score", start: 0, duration: compositionTiming.duration, cueCount: 1, manifest: "audio/mix.json" }),
    freezeCue({ id: "sfx-bus", role: "sfx", start: 26.42, duration: 172.657196, cueCount: 21, manifest: "audio/mix.json" }),
    freezeCue({ id: "final-mix", role: "master", start: 0, duration: compositionTiming.duration, cueCount: 1, manifest: "audio/mix.json" })
  ])
});
