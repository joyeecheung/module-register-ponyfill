// Ported from Node.js: fixtures/es-module-loaders/loader-resolve-passthru.mjs
// A resolve hook that passes through to the default for all specifiers,
// counting invocations via SharedArrayBuffer.

/** @type {Int32Array | undefined} */
let shared;

export async function initialize(data) {
  shared = new Int32Array(data.shared);
}

export async function resolve(specifier, _context, next) {
  if (specifier === 'node:fs' || specifier.includes('hook')) {
    return next(specifier);
  }

  if (shared) Atomics.add(shared, 0, 1);
  return next(specifier);
}
