import { createCylinderChapterScene, cylinderChapter } from "./cylinder.js";
import { createKleinChapterScene, kleinChapter } from "./klein.js";
import { createMobiusChapterScene, mobiusChapter } from "./mobius.js";
import { createPlaneChapterScene, planeChapter } from "./plane.js";
import { createProjectiveChapterScene, projectiveChapter } from "./projective.js";
import { createSphereChapterScene, sphereChapter } from "./sphere.js";
import { createTorusChapterScene, torusChapter } from "./torus.js";

export const topologyChapterDefinitions = Object.freeze({
  plane: planeChapter,
  cylinder: cylinderChapter,
  torus: torusChapter,
  mobius: mobiusChapter,
  klein: kleinChapter,
  projective: projectiveChapter,
  sphere: sphereChapter
});

const factories = Object.freeze({
  plane: createPlaneChapterScene,
  cylinder: createCylinderChapterScene,
  torus: createTorusChapterScene,
  mobius: createMobiusChapterScene,
  klein: createKleinChapterScene,
  projective: createProjectiveChapterScene,
  sphere: createSphereChapterScene
});

export function createChapterScene(documentRef, sceneDefinition) {
  const factory = factories[sceneDefinition.chapterId];
  if (!factory) throw new Error(`unknown PV chapter ${sceneDefinition.chapterId}`);
  return factory(documentRef, sceneDefinition);
}
