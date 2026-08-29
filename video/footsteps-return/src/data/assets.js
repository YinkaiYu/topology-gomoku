const repositoryAsset = (id, path) => Object.freeze({
  id,
  path,
  provenance: Object.freeze({ type: "repository", source: path })
});

const projectCopy = (id, path, source) => Object.freeze({
  id,
  path,
  provenance: Object.freeze({ type: "repository-copy", source })
});

const userProvidedCopy = (id, path, provenanceFile) => Object.freeze({
  id,
  path,
  provenance: Object.freeze({ type: "user-provided", source: provenanceFile })
});

const packageCopy = (id, path, source) => Object.freeze({
  id,
  path,
  provenance: Object.freeze({ type: "package-copy", source })
});

export const assets = Object.freeze([
  projectCopy("font-topo-serif-400", "video/footsteps-return/assets/fonts/noto-serif-sc-400.woff2", "app/assets/fonts/noto-serif-sc-400.woff2"),
  projectCopy("font-topo-serif-600", "video/footsteps-return/assets/fonts/noto-serif-sc-600.woff2", "app/assets/fonts/noto-serif-sc-600.woff2"),
  projectCopy("font-topo-serif-700", "video/footsteps-return/assets/fonts/noto-serif-sc-700.woff2", "app/assets/fonts/noto-serif-sc-700.woff2"),
  projectCopy("topology-plane", "video/footsteps-return/assets/topologies/plane.svg", "app/assets/topologies/plane.svg"),
  projectCopy("chapter-topology-plane", "video/footsteps-return/assets/topology/plane.svg", "app/assets/topologies/plane.svg"),
  projectCopy("chapter-topology-cylinder", "video/footsteps-return/assets/topology/cylinder.svg", "app/assets/topologies/cylinder.svg"),
  projectCopy("chapter-topology-torus", "video/footsteps-return/assets/topology/torus.svg", "app/assets/topologies/torus.svg"),
  projectCopy("chapter-topology-mobius", "video/footsteps-return/assets/topology/mobius.svg", "app/assets/topologies/mobius.svg"),
  projectCopy("chapter-topology-klein", "video/footsteps-return/assets/topology/klein.svg", "app/assets/topologies/klein.svg"),
  projectCopy("chapter-topology-projective", "video/footsteps-return/assets/topology/projective.svg", "app/assets/topologies/projective.svg"),
  projectCopy("chapter-topology-sphere", "video/footsteps-return/assets/topology/sphere.svg", "app/assets/topologies/sphere.svg"),
  repositoryAsset("topology-cylinder", "app/assets/topologies/cylinder.svg"),
  repositoryAsset("topology-torus", "app/assets/topologies/torus.svg"),
  repositoryAsset("topology-mobius", "app/assets/topologies/mobius.svg"),
  repositoryAsset("topology-klein", "app/assets/topologies/klein.svg"),
  repositoryAsset("topology-projective", "app/assets/topologies/projective.svg"),
  repositoryAsset("topology-sphere", "app/assets/topologies/sphere.svg"),
  projectCopy("silhouette-cylinder", "video/footsteps-return/assets/topologies/cylinder.svg", "app/assets/silhouettes/cylinder.svg"),
  projectCopy("silhouette-torus", "video/footsteps-return/assets/topologies/torus.svg", "app/assets/silhouettes/torus.svg"),
  projectCopy("silhouette-mobius", "video/footsteps-return/assets/topologies/mobius.svg", "app/assets/silhouettes/mobius.svg"),
  projectCopy("silhouette-klein", "video/footsteps-return/assets/topologies/klein.svg", "app/assets/silhouettes/klein.svg"),
  projectCopy("silhouette-projective", "video/footsteps-return/assets/topologies/projective.svg", "app/assets/silhouettes/projective.svg"),
  projectCopy("silhouette-sphere", "video/footsteps-return/assets/topologies/sphere.svg", "app/assets/silhouettes/sphere.svg"),
  repositoryAsset("brand-icon", "app/assets/brand-icon.png"),
  projectCopy("brand-topology-gomoku", "video/footsteps-return/assets/brand/topology-gomoku.png", "app/assets/brand-icon.png"),
  userProvidedCopy("brand-iop-logo", "video/footsteps-return/assets/brand/iop-logo.png", "video/footsteps-return/assets/provenance.json"),
  projectCopy("intro-game-index", "video/footsteps-return/assets/game-source/index.html", "app/index.html"),
  projectCopy("intro-game-style", "video/footsteps-return/assets/game-source/assets/style.css", "app/assets/style.css"),
  projectCopy("intro-game-topology", "video/footsteps-return/assets/game-source/assets/topology.js", "app/assets/topology.js"),
  projectCopy("intro-game-morph", "video/footsteps-return/assets/game-source/assets/topology-morph.js", "app/assets/topology-morph.js"),
  projectCopy("intro-game-replay", "video/footsteps-return/assets/game-source/assets/game-replay.js", "app/assets/game-replay.js"),
  projectCopy("intro-game-runtime", "video/footsteps-return/assets/game-source/assets/game.js", "app/assets/game.js"),
  projectCopy("intro-game-font-400", "video/footsteps-return/assets/game-source/assets/fonts/noto-serif-sc-400.woff2", "app/assets/fonts/noto-serif-sc-400.woff2"),
  projectCopy("intro-game-font-600", "video/footsteps-return/assets/game-source/assets/fonts/noto-serif-sc-600.woff2", "app/assets/fonts/noto-serif-sc-600.woff2"),
  projectCopy("intro-game-font-700", "video/footsteps-return/assets/game-source/assets/fonts/noto-serif-sc-700.woff2", "app/assets/fonts/noto-serif-sc-700.woff2"),
  projectCopy("intro-game-brand-icon", "video/footsteps-return/assets/game-source/assets/brand-icon.png", "app/assets/brand-icon.png"),
  projectCopy("intro-game-topology-plane", "video/footsteps-return/assets/game-source/assets/topologies/plane.svg", "app/assets/topologies/plane.svg"),
  projectCopy("intro-game-topology-cylinder", "video/footsteps-return/assets/game-source/assets/topologies/cylinder.svg", "app/assets/topologies/cylinder.svg"),
  projectCopy("intro-game-topology-torus", "video/footsteps-return/assets/game-source/assets/topologies/torus.svg", "app/assets/topologies/torus.svg"),
  projectCopy("intro-game-topology-mobius", "video/footsteps-return/assets/game-source/assets/topologies/mobius.svg", "app/assets/topologies/mobius.svg"),
  projectCopy("intro-game-topology-klein", "video/footsteps-return/assets/game-source/assets/topologies/klein.svg", "app/assets/topologies/klein.svg"),
  projectCopy("intro-game-topology-projective", "video/footsteps-return/assets/game-source/assets/topologies/projective.svg", "app/assets/topologies/projective.svg"),
  projectCopy("intro-game-topology-sphere", "video/footsteps-return/assets/game-source/assets/topologies/sphere.svg", "app/assets/topologies/sphere.svg"),
  projectCopy("intro-game-silhouette-cylinder", "video/footsteps-return/assets/game-source/assets/silhouettes/cylinder.svg", "app/assets/silhouettes/cylinder.svg"),
  projectCopy("intro-game-silhouette-torus", "video/footsteps-return/assets/game-source/assets/silhouettes/torus.svg", "app/assets/silhouettes/torus.svg"),
  projectCopy("intro-game-silhouette-mobius", "video/footsteps-return/assets/game-source/assets/silhouettes/mobius.svg", "app/assets/silhouettes/mobius.svg"),
  projectCopy("intro-game-silhouette-klein", "video/footsteps-return/assets/game-source/assets/silhouettes/klein.svg", "app/assets/silhouettes/klein.svg"),
  projectCopy("intro-game-silhouette-projective", "video/footsteps-return/assets/game-source/assets/silhouettes/projective.svg", "app/assets/silhouettes/projective.svg"),
  projectCopy("intro-game-silhouette-sphere", "video/footsteps-return/assets/game-source/assets/silhouettes/sphere.svg", "app/assets/silhouettes/sphere.svg"),
  packageCopy("three-runtime", "video/footsteps-return/src/vendor/three.module.min.js", "three@0.185.1/build/three.module.min.js"),
  packageCopy("three-core-runtime", "video/footsteps-return/src/vendor/three.core.min.js", "three@0.185.1/build/three.core.min.js")
]);
