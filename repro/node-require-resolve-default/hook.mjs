// Ported from Node.js: fixtures/es-module-loaders/loader-resolve-passthru.mjs
// A resolve hook that counts non-internal resolve calls via SharedArrayBuffer.
export async function initialize(data) {
  globalThis.__resolveShared = new Int32Array(data.shared);
}

export async function resolve(specifier, context, next) {
  // Skip internal/hook-related specifiers (same filter as the upstream fixture).
  if (specifier === 'node:fs' || specifier.includes('hook')) {
    return next(specifier);
  }

  const shared = globalThis.__resolveShared;
  if (shared) {
    Atomics.add(shared, 0, 1);
  }
  return next(specifier);
}
