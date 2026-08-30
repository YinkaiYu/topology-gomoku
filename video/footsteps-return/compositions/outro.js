import { createSceneElement } from "./shared/scene.js";

export function createOutroScene(documentRef, sceneDefinition) {
  const composition = documentRef.createElement("div");
  composition.className = "outro-composition";
  composition.setAttribute("aria-hidden", "true");

  const aperture = documentRef.createElement("div");
  aperture.className = "outro-aperture";
  aperture.dataset.outroAperture = "";
  aperture.dataset.occlusion = "outro-darkness";
  aperture.dataset.matchShape = "outro-darkness";
  aperture.dataset.matchGeometry = "dark-aperture";
  aperture.setAttribute("aria-hidden", "true");

  const closingLight = documentRef.createElement("span");
  closingLight.className = "outro-aperture__closing-light";
  closingLight.dataset.outroClosingLight = "";
  closingLight.dataset.matchShape = "outro-darkness";
  closingLight.dataset.occlusion = "outro-darkness";
  closingLight.setAttribute("aria-hidden", "true");
  aperture.append(closingLight);

  composition.append(aperture);
  return createSceneElement(documentRef, sceneDefinition, composition);
}
