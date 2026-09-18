export function shouldBuildSidecar({ currentHash, cachedHash, outputExists, nativeExists }) {
  return !outputExists || !nativeExists || currentHash !== cachedHash;
}
