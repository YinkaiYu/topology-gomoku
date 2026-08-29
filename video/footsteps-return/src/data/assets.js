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

export const assets = Object.freeze([
  projectCopy("font-topo-serif-400", "video/footsteps-return/assets/fonts/noto-serif-sc-400.woff2", "app/assets/fonts/noto-serif-sc-400.woff2"),
  projectCopy("font-topo-serif-600", "video/footsteps-return/assets/fonts/noto-serif-sc-600.woff2", "app/assets/fonts/noto-serif-sc-600.woff2"),
  projectCopy("font-topo-serif-700", "video/footsteps-return/assets/fonts/noto-serif-sc-700.woff2", "app/assets/fonts/noto-serif-sc-700.woff2"),
  projectCopy("topology-plane", "video/footsteps-return/assets/topologies/plane.svg", "app/assets/topologies/plane.svg"),
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
  repositoryAsset("brand-icon", "app/assets/brand-icon.png")
]);
