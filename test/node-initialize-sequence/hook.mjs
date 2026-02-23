// Ported from Node.js: fixtures/es-module-loaders/hooks-initialize.mjs
// Records an incrementing counter into a SharedArrayBuffer on each initialize().

let counter = 0;

export async function initialize(data) {
  const view = new Int32Array(data.shared);
  const slot = Atomics.add(view, 0, 1); // old value = 0-based call index
  Atomics.store(view, slot + 1, ++counter); // store at [1], [2], ...
}
