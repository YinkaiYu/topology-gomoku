function canonicalJson(value) {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
}

export function canonicalMixRenderContract(mixManifest) {
  return canonicalJson({
    composition: mixManifest.composition,
    inputs: mixManifest.inputs,
    processing: mixManifest.processing,
    tail: mixManifest.tail
  });
}

export async function hashMixRenderContract(mixManifest, cryptoRef = globalThis.crypto) {
  if (!cryptoRef?.subtle) {
    throw new Error("SHA-256 Web Crypto is unavailable");
  }
  const bytes = new TextEncoder().encode(canonicalMixRenderContract(mixManifest));
  return hashBytesSha256(bytes, cryptoRef);
}

export async function hashBytesSha256(bytes, cryptoRef = globalThis.crypto) {
  if (!cryptoRef?.subtle) {
    throw new Error("SHA-256 Web Crypto is unavailable");
  }
  const digest = await cryptoRef.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
