import { chapters } from "../data/chapters.js";
import { masterTimeline as timelineDefinition } from "../data/timeline.js";
import { addChapterTitleReveal, createChapterTitleScene } from "../../compositions/chapter-titles.js";
import { addEndCardReveal, createEndCardScene } from "../../compositions/end-card.js";
import { addIntroReveal, createIntroScene } from "../../compositions/intro.js";
import { createChapterScene } from "../../compositions/chapters/index.js";
import { createSevenWorldGalleryScene, addSevenWorldGalleryMotion } from "../../compositions/seven-worlds.js";
import { createPlaceholderScene, createSceneRegistry } from "../../compositions/shared/scene.js";
import { addTopologyChapterMotion } from "./topology-surfaces.js";
import { addCinematicTransition, getTransitionContract, TRANSITION_DURATION, validateTransitionContracts } from "./transitions.js";

export function buildMasterTimeline({ document: documentRef, gsap, stage, sceneFactories = {} }) {
  if (!gsap?.timeline) {
    throw new TypeError("GSAP is required to build the master timeline");
  }

  const chapterById = new Map(chapters.map((chapter) => [chapter.id, chapter]));
  const registry = createSceneRegistry(stage);
  const scenePairs = timelineDefinition.scenes.map((definition) => {
    const chapter = chapterById.get(definition.chapterId);
    const defaultFactories = {
      "chapter-card": ({ document, definition: scene, chapter: sceneChapter }) => createChapterTitleScene(document, scene, sceneChapter),
      chapter: ({ document, definition: scene }) => createChapterScene(document, scene),
      "end-card": ({ document, definition: scene }) => createEndCardScene(document, scene),
      intro: ({ document, definition: scene }) => createIntroScene(document, scene),
      "seven-world-gallery": ({ document, definition: scene }) => createSevenWorldGalleryScene(document, scene)
    };
    const defaultFactory = defaultFactories[definition.kind]
      ?? (({ document, definition: scene }) => createPlaceholderScene(document, scene));
    const factory = sceneFactories[definition.kind] ?? defaultFactory;
    const element = factory({ document: documentRef, definition, chapter });
    registry.register(definition, element);
    return { definition, element };
  });

  validateTransitionContracts(timelineDefinition.scenes);

  const timeline = gsap.timeline({ paused: true });
  const elements = scenePairs.map(({ element }) => element);
  timeline.set(elements.slice(1), { opacity: 0 }, 0);
  timeline.set(elements[0], { opacity: 1 }, 0);

  scenePairs.forEach(({ definition, element }, index) => {
    timeline.addLabel(definition.id, definition.start);
    if (index > 0) {
      const transitionStart = Math.max(0, definition.start - TRANSITION_DURATION);
      const previous = scenePairs[index - 1].element;
      const contract = getTransitionContract(timelineDefinition.scenes[index - 1].id, definition.id);
      addCinematicTransition(timeline, {
        document: documentRef,
        stage,
        from: previous,
        to: element,
        contract,
        start: transitionStart,
        duration: TRANSITION_DURATION
      });
    }

    if (definition.kind === "chapter-card" && element.querySelector("[data-chapter-card]")) {
      addChapterTitleReveal(timeline, element, definition.start);
    } else if (definition.kind === "intro" && element.querySelector("[data-intro-board-edge]")) {
      addIntroReveal(timeline, element, definition.start);
    } else if (definition.kind === "chapter" && element.querySelector("[data-chapter-board]")) {
      addTopologyChapterMotion(timeline, element, definition.start, definition.duration);
    } else if (definition.kind === "seven-world-gallery" && element.querySelector("[data-seven-world-gallery]")) {
      addSevenWorldGalleryMotion(timeline, element, definition.start, definition.duration);
    } else if (definition.kind === "end-card" && element.querySelector("[data-game-title-mark]")) {
      addEndCardReveal(timeline, element, definition.start);
    } else {
      const atmosphere = element.querySelector("[data-scene-atmosphere]");
      if (atmosphere) {
        timeline.from(atmosphere, {
          opacity: 0,
          scale: 0.995,
          duration: 0.8,
          ease: "power1.out",
          immediateRender: false
        }, definition.start + 0.18);
      }
    }
  });

  timeline.set(stage, { opacity: 1 }, timelineDefinition.duration);

  return Object.freeze({ timeline, registry: registry.scenes });
}
