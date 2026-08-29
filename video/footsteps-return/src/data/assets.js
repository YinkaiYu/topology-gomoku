const repositoryAsset = (id, path) => Object.freeze({
  id,
  path,
  provenance: Object.freeze({ type: "repository", source: path })
});

export const assets = Object.freeze([
  repositoryAsset("font-topo-serif-400", "app/assets/fonts/noto-serif-sc-400.woff2"),
  repositoryAsset("font-topo-serif-600", "app/assets/fonts/noto-serif-sc-600.woff2"),
  repositoryAsset("font-topo-serif-700", "app/assets/fonts/noto-serif-sc-700.woff2"),
  repositoryAsset("topology-plane", "app/assets/topologies/plane.svg"),
  repositoryAsset("topology-cylinder", "app/assets/topologies/cylinder.svg"),
  repositoryAsset("topology-torus", "app/assets/topologies/torus.svg"),
  repositoryAsset("topology-mobius", "app/assets/topologies/mobius.svg"),
  repositoryAsset("topology-klein", "app/assets/topologies/klein.svg"),
  repositoryAsset("topology-projective", "app/assets/topologies/projective.svg"),
  repositoryAsset("topology-sphere", "app/assets/topologies/sphere.svg"),
  repositoryAsset("silhouette-cylinder", "app/assets/silhouettes/cylinder.svg"),
  repositoryAsset("silhouette-torus", "app/assets/silhouettes/torus.svg"),
  repositoryAsset("silhouette-mobius", "app/assets/silhouettes/mobius.svg"),
  repositoryAsset("silhouette-klein", "app/assets/silhouettes/klein.svg"),
  repositoryAsset("silhouette-projective", "app/assets/silhouettes/projective.svg"),
  repositoryAsset("silhouette-sphere", "app/assets/silhouettes/sphere.svg"),
  repositoryAsset("brand-icon", "app/assets/brand-icon.png")
]);
