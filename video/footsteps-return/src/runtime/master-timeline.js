import { chapters } from "../data/chapters.js";
import { masterTimeline as timelineDefinition } from "../data/timeline.js";
import { addChapterTitleReveal, createChapterTitleScene } from "../../compositions/chapter-titles.js";
import { createPlaceholderScene, createSceneRegistry } from "../../compositions/shared/scene.js";

const TRANSITION_DURATION = 0.62;

export function buildMasterTimeline({ document: documentRef, gsap, stage }) {
  if (!gsap?.timeline) {
    throw new TypeError("GSAP is required to build the master timeline");
  }

  const chapterById = new Map(chapters.map((chapter) => [chapter.id, chapter]));
  const registry = createSceneRegistry(stage);
  const scenePairs = timelineDefinition.scenes.map((definition) => {
    const element = definition.kind === "chapter-card"
      ? createChapterTitleScene(documentRef, definition, chapterById.get(definition.chapterId))
      : createPlaceholderScene(documentRef, definition);
    registry.register(definition, element);
    return { definition, element };
  });

  const timeline = gsap.timeline({ paused: true });
  const elements = scenePairs.map(({ element }) => element);
  timeline.set(elements.slice(1), { opacity: 0 }, 0);
  timeline.set(elements[0], { opacity: 1 }, 0);

  scenePairs.forEach(({ definition, element }, index) => {
    timeline.addLabel(definition.id, definition.start);
    if (index > 0) {
      const transitionStart = Math.max(0, definition.start - TRANSITION_DURATION);
      const previous = scenePairs[index - 1].element;
      timeline.to(previous, { opacity: 0, duration: TRANSITION_DURATION, ease: "sine.inOut" }, transitionStart);
      timeline.fromTo(element, { opacity: 0 }, {
        opacity: 1,
        duration: TRANSITION_DURATION,
        ease: "sine.inOut",
        immediateRender: false
      }, transitionStart);
    }

    if (definition.kind === "chapter-card") {
      addChapterTitleReveal(timeline, element, definition.start);
    } else {
      timeline.from(element.querySelector("[data-scene-atmosphere]"), {
        opacity: 0,
        scale: 0.995,
        duration: 0.8,
        ease: "power1.out",
        immediateRender: false
      }, definition.start + 0.18);
    }
  });

  return Object.freeze({ timeline, registry: registry.scenes });
}
