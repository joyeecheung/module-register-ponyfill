// Ported from Node.js: fixtures/es-module-loaders/hooks-initialize.mjs
// Records invocation via SharedArrayBuffer (same as node-initialize-invoke).
export async function initialize(data) {
  const view = new Int32Array(data.shared);
  Atomics.add(view, 0, 1);
}
