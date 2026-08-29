export const composition = Object.freeze({
  id: "footsteps-return",
  duration: 1,
  width: 3840,
  height: 2160,
  fps: 60
});

export function createCompositionTimeline(gsap) {
  return gsap.timeline({ paused: true });
}
