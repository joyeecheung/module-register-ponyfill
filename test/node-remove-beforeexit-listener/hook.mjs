// Delays the default nextLoad by 99ms to simulate an async load hook.
// Ported from Node.js fixture: loader-delayed-async-load.mjs
export function load(url, context, nextLoad) {
  return new Promise((resolve) => setTimeout(() => resolve(nextLoad(url, context)), 99));
}
