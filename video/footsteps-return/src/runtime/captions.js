import { captionCues, captionStyle } from "../data/captions.js";

export function addCaptionTrack(timeline, {
  document: documentRef,
  cues = captionCues,
  fps = 60
}) {
  if (!timeline?.set || !timeline?.to) throw new TypeError("GSAP timeline is required for captions");
  const group = documentRef.querySelector("[data-caption-group]");
  if (!group) throw new Error("the single caption group is missing");

  group.replaceChildren();
  const elements = cues.map((cue) => {
    const element = documentRef.createElement("p");
    element.className = "caption-group__text";
    element.dataset.captionText = "";
    element.dataset.captionCue = cue.id;
    element.textContent = cue.text;
    element.setAttribute("aria-hidden", "true");
    group.append(element);
    return element;
  });

  timeline.set(group, { opacity: 1 }, 0);
  timeline.set(elements, { opacity: 0 }, 0);
  cues.forEach((cue, index) => {
    const element = elements[index];
    const fadeInDuration = cue.fadeInFrames / fps;
    const fadeOutDuration = cue.fadeOutFrames / fps;
    timeline.fromTo(element, { opacity: 0 }, {
      opacity: 1,
      duration: fadeInDuration,
      ease: "sine.out",
      immediateRender: false
    }, cue.start);
    timeline.to(element, {
      opacity: 0,
      duration: fadeOutDuration,
      ease: "sine.in",
      immediateRender: false
    }, cue.end - fadeOutDuration);
    timeline.set(element, { opacity: 0, immediateRender: false }, cue.hardClearAt);
  });
  group.dataset.captionFadeFrames = String(captionStyle.fadeFrames);
  group.dataset.captionCueCount = String(cues.length);
  group.dataset.captionHardClear = "true";
  return { group, elements, cueCount: cues.length };
}
