// Ported from Node.js: fixtures/es-module-loaders/hooks-initialize.mjs
// An initialize-only hook that records an invocation counter via SharedArrayBuffer.

/** @type {Int32Array | undefined} */
let shared;

export async function initialize(data) {
  shared = new Int32Array(data.shared);
  Atomics.add(shared, 0, 1);
}
