const freezeScene = (scene) => Object.freeze({ ...scene, narrationCueIds: Object.freeze(scene.narrationCueIds), transition: Object.freeze(scene.transition) });
const freezeCue = (cue) => Object.freeze(cue);

export const masterTimeline = Object.freeze({
  id: "footsteps-return-master",
  duration: 165,
  scenes: Object.freeze([
    freezeScene({ id: "intro", kind: "intro", start: 0, duration: 19, narrationCueIds: ["intro-boundary", "intro-roads", "intro-invitation"], transition: { kind: "surface-reveal", target: "chapter-card-plane" } }),
    freezeScene({ id: "chapter-card-plane", kind: "chapter-card", chapterId: "plane", start: 19, duration: 3, narrationCueIds: [], transition: { kind: "match-cut", target: "chapter-plane" } }),
    freezeScene({ id: "chapter-plane", kind: "chapter", chapterId: "plane", start: 22, duration: 10, narrationCueIds: ["plane-order"], transition: { kind: "surface-occlusion", target: "chapter-card-cylinder" } }),
    freezeScene({ id: "chapter-card-cylinder", kind: "chapter-card", chapterId: "cylinder", start: 34, duration: 3, narrationCueIds: [], transition: { kind: "match-cut", target: "chapter-cylinder" } }),
    freezeScene({ id: "chapter-cylinder", kind: "chapter", chapterId: "cylinder", start: 37, duration: 11, narrationCueIds: ["cylinder-cycle", "cylinder-distance"], transition: { kind: "surface-occlusion", target: "chapter-card-torus" } }),
    freezeScene({ id: "chapter-card-torus", kind: "chapter-card", chapterId: "torus", start: 50, duration: 3, narrationCueIds: [], transition: { kind: "match-cut", target: "chapter-torus" } }),
    freezeScene({ id: "chapter-torus", kind: "chapter", chapterId: "torus", start: 53, duration: 12, narrationCueIds: ["torus-cycles", "torus-shortest-path"], transition: { kind: "surface-occlusion", target: "chapter-card-mobius" } }),
    freezeScene({ id: "chapter-card-mobius", kind: "chapter-card", chapterId: "mobius", start: 67, duration: 3, narrationCueIds: [], transition: { kind: "match-cut", target: "chapter-mobius" } }),
    freezeScene({ id: "chapter-mobius", kind: "chapter", chapterId: "mobius", start: 70, duration: 11, narrationCueIds: ["mobius-turn", "mobius-one-side"], transition: { kind: "surface-occlusion", target: "chapter-card-klein" } }),
    freezeScene({ id: "chapter-card-klein", kind: "chapter-card", chapterId: "klein", start: 83, duration: 3, narrationCueIds: [], transition: { kind: "match-cut", target: "chapter-klein" } }),
    freezeScene({ id: "chapter-klein", kind: "chapter", chapterId: "klein", start: 86, duration: 12, narrationCueIds: ["klein-two-returns", "klein-memory"], transition: { kind: "surface-occlusion", target: "chapter-card-projective" } }),
    freezeScene({ id: "chapter-card-projective", kind: "chapter-card", chapterId: "projective", start: 100, duration: 3, narrationCueIds: [], transition: { kind: "match-cut", target: "chapter-projective" } }),
    freezeScene({ id: "chapter-projective", kind: "chapter", chapterId: "projective", start: 103, duration: 12, narrationCueIds: ["projective-reflection", "projective-twin"], transition: { kind: "surface-occlusion", target: "chapter-card-sphere" } }),
    freezeScene({ id: "chapter-card-sphere", kind: "chapter-card", chapterId: "sphere", start: 117, duration: 3, narrationCueIds: [], transition: { kind: "match-cut", target: "chapter-sphere" } }),
    freezeScene({ id: "chapter-sphere", kind: "chapter", chapterId: "sphere", start: 120, duration: 20, narrationCueIds: ["sphere-closure", "sphere-map", "sphere-boundary"], transition: { kind: "surface-occlusion", target: "seven-world-gallery" } }),
    freezeScene({ id: "seven-world-gallery", kind: "seven-world-gallery", start: 140, duration: 9.2, narrationCueIds: [], transition: { kind: "match-cut", target: "outro" } }),
    freezeScene({ id: "outro", kind: "outro", start: 147, duration: 14, narrationCueIds: ["outro-invocation", "outro-connection", "outro-stone", "outro-world"], transition: { kind: "fade-to-black", target: "end-card" } }),
    freezeScene({ id: "end-card", kind: "end-card", start: 161, duration: 4, narrationCueIds: [], transition: { kind: "hold", target: null } })
  ]),
  narration: Object.freeze([
    freezeCue({ cueId: "intro-boundary", start: 0, duration: 4, subtitleGroupId: "intro-boundary" }),
    freezeCue({ cueId: "intro-roads", start: 4, duration: 8, subtitleGroupId: "intro-roads" }),
    freezeCue({ cueId: "intro-invitation", start: 12, duration: 7, subtitleGroupId: "intro-invitation" }),
    freezeCue({ cueId: "plane-order", start: 22, duration: 10, subtitleGroupId: "plane-order" }),
    freezeCue({ cueId: "cylinder-cycle", start: 37, duration: 7, subtitleGroupId: "cylinder-cycle" }),
    freezeCue({ cueId: "cylinder-distance", start: 44, duration: 4, subtitleGroupId: "cylinder-distance" }),
    freezeCue({ cueId: "torus-cycles", start: 53, duration: 8, subtitleGroupId: "torus-cycles" }),
    freezeCue({ cueId: "torus-shortest-path", start: 61, duration: 4, subtitleGroupId: "torus-shortest-path" }),
    freezeCue({ cueId: "mobius-turn", start: 70, duration: 7, subtitleGroupId: "mobius-turn" }),
    freezeCue({ cueId: "mobius-one-side", start: 77, duration: 4, subtitleGroupId: "mobius-one-side" }),
    freezeCue({ cueId: "klein-two-returns", start: 86, duration: 9, subtitleGroupId: "klein-two-returns" }),
    freezeCue({ cueId: "klein-memory", start: 95, duration: 3, subtitleGroupId: "klein-memory" }),
    freezeCue({ cueId: "projective-reflection", start: 103, duration: 6, subtitleGroupId: "projective-reflection" }),
    freezeCue({ cueId: "projective-twin", start: 109, duration: 6, subtitleGroupId: "projective-twin" }),
    freezeCue({ cueId: "sphere-closure", start: 120, duration: 9, subtitleGroupId: "sphere-closure" }),
    freezeCue({ cueId: "sphere-map", start: 129, duration: 5, subtitleGroupId: "sphere-map" }),
    freezeCue({ cueId: "sphere-boundary", start: 134, duration: 6, subtitleGroupId: "sphere-boundary" }),
    freezeCue({ cueId: "outro-invocation", start: 147, duration: 3, subtitleGroupId: "outro-invocation" }),
    freezeCue({ cueId: "outro-connection", start: 150, duration: 4, subtitleGroupId: "outro-connection" }),
    freezeCue({ cueId: "outro-stone", start: 154, duration: 3, subtitleGroupId: "outro-stone" }),
    freezeCue({ cueId: "outro-world", start: 157, duration: 4, subtitleGroupId: "outro-world" })
  ]),
  audio: Object.freeze([freezeCue({ id: "score-master", role: "score", start: 0, duration: 165 })])
});
