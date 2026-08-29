const freeze = Object.freeze;
const path = (value) => {
  const sequence = [];
  for (let step = 1; step <= 5; step += 1) {
    if (value.crossings.includes(step)) sequence.push(freeze({ kind: "breathe", beforeStep: step, cycles: 2 }));
    sequence.push(freeze({ kind: "drop", step, progress: freeze([0, 1]) }));
  }
  sequence.push(freeze({ kind: "hold", step: 5, winningFive: true }));
  return freeze({ ...value, start: freeze(value.start), points: freeze(value.points.map(freeze)), crossings: freeze(value.crossings), sequence: freeze(sequence) });
};
const shot = (id, level, width, height, demos) => freeze({ id, topology: id, level, board: freeze({ width, height, target: 5 }), demos: freeze(demos.map(path)) });

export const gameRenderShots = freeze([
  shot("plane", 0, 7, 7, [{ id: "ordinary-five", start: [1,3], direction: 0, points: [[1,3],[2,3],[3,3],[4,3],[5,3]], crossings: [] }]),
  shot("cylinder", 1, 7, 6, [{ id: "horizontal-wrap", start: [5,2], direction: 0, points: [[5,2],[6,2],[0,2],[1,2],[2,2]], crossings: [3] }]),
  shot("torus", 2, 7, 6, [{ id: "two-seam-diagonal", start: [1,0], direction: 5, points: [[1,0],[0,5],[6,4],[5,3],[4,2]], crossings: [2,3] }]),
  shot("mobius", 3, 8, 6, [{ id: "reflected-crossing", start: [6,1], direction: 0, points: [[6,1],[7,1],[0,4],[1,4],[2,4]], crossings: [3] }]),
  shot("klein", 4, 7, 6, [
    { id: "preserved-crossing", start: [3,4], direction: 2, points: [[3,4],[3,5],[3,0],[3,1],[3,2]], crossings: [3] },
    { id: "reflected-crossing", start: [1,0], direction: 5, points: [[1,0],[0,5],[6,1],[5,2],[4,3]], crossings: [2,3] }
  ]),
  shot("projective", 5, 8, 8, [{ id: "mirrored-crossings", start: [1,0], direction: 5, points: [[1,0],[7,7],[0,1],[1,2],[2,3]], crossings: [2,3] }]),
  shot("sphere", 6, 7, 7, [{ id: "adjacent-edge-turn", start: [2,1], direction: 6, points: [[2,1],[2,0],[0,2],[1,2],[2,2]], crossings: [3] }])
]);

export function findGameRenderShot(id, demoId) {
  const definition = gameRenderShots.find((item) => item.id === id);
  if (!definition) throw new Error(`Unknown topology: ${id}`);
  const demo = definition.demos.find((item) => item.id === demoId) || definition.demos[0];
  return { definition, demo };
}
