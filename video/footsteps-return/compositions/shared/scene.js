function requireElement(value, label) {
  if (!value || typeof value.append !== "function") {
    throw new TypeError(`${label} must be a DOM element`);
  }
}

export function createSceneElement(documentRef, definition, content) {
  if (!definition?.id || !definition?.kind) {
    throw new TypeError("scene definitions need stable id and kind values");
  }

  const scene = documentRef.createElement("section");
  scene.id = `pv-scene-${definition.id}`;
  scene.className = `pv-scene pv-scene--${definition.kind}`;
  scene.dataset.sceneId = definition.id;
  scene.dataset.sceneKind = definition.kind;
  scene.dataset.sceneStart = String(definition.start);
  scene.dataset.sceneDuration = String(definition.duration);
  scene.setAttribute("aria-label", `${definition.id} scene`);

  if (definition.chapterId) {
    scene.dataset.chapterId = definition.chapterId;
  }
  if (content) {
    scene.append(content);
  }
  return scene;
}

export function createSceneRegistry(stage) {
  requireElement(stage, "stage");
  const scenes = Object.create(null);

  return {
    scenes,
    register(definition, element) {
      requireElement(element, `scene ${definition?.id ?? "unknown"}`);
      if (Object.hasOwn(scenes, definition.id)) {
        throw new Error(`scene ${definition.id} is already registered`);
      }
      scenes[definition.id] = element;
      stage.append(element);
      return element;
    }
  };
}

export function createPlaceholderScene(documentRef, definition) {
  const atmosphere = documentRef.createElement("div");
  atmosphere.className = "pv-scene__atmosphere";
  atmosphere.dataset.sceneAtmosphere = definition.id;
  atmosphere.dataset.layoutIgnore = "";
  atmosphere.setAttribute("aria-hidden", "true");
  return createSceneElement(documentRef, definition, atmosphere);
}
