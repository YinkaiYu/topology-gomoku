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
    element.setAttribute("aria-hidden", "true");
    const copy = documentRef.createElement("span");
    copy.className = "caption-group__copy";
    copy.dataset.captionCopy = "";
    copy.textContent = cue.text;
    const baselineMarker = documentRef.createElement("span");
    baselineMarker.className = "caption-group__baseline-marker";
    baselineMarker.dataset.captionBaselineMarker = "";
    baselineMarker.setAttribute("aria-hidden", "true");
    element.append(copy, baselineMarker);
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
  group.dataset.captionBaselineReady = "false";
  return { group, elements, cueCount: cues.length };
}

export function alignCaptionBaselines({ document: documentRef, root, baselineBottom } = {}) {
  const compositionRoot = root ?? documentRef.querySelector('[data-composition-id="footsteps-return"]');
  const group = compositionRoot?.querySelector("[data-caption-group]");
  if (!compositionRoot || !group) throw new Error("caption baseline alignment needs the composition root and caption group");
  const cssBaselineBottom = Number.parseFloat(compositionRoot.ownerDocument.defaultView.getComputedStyle(compositionRoot).getPropertyValue("--caption-baseline-bottom"));
  const resolvedBaselineBottom = baselineBottom ?? cssBaselineBottom;
  if (!Number.isFinite(resolvedBaselineBottom)) throw new Error("caption baseline token must resolve to pixels");
  const elements = [...group.querySelectorAll("[data-caption-cue]")];
  const targetY = compositionRoot.getBoundingClientRect().bottom - resolvedBaselineBottom;

  elements.forEach((element) => element.style.removeProperty("--caption-baseline-shift"));
  elements.forEach((element) => {
    const marker = element.querySelector("[data-caption-baseline-marker]");
    if (!marker) throw new Error(`caption ${element.dataset.captionCue} is missing its baseline marker`);
    const shift = targetY - marker.getBoundingClientRect().top;
    element.style.setProperty("--caption-baseline-shift", `${shift}px`);
  });
  group.dataset.captionBaselineReady = "true";
  group.dataset.captionBaselineBottom = String(resolvedBaselineBottom);
  return elements.length;
}
