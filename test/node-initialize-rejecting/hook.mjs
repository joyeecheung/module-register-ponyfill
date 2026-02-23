// Ported from Node.js: fixtures/es-module-loaders/loader-initialize-rejecting.mjs
export function initialize() {
  return Promise.reject();
}
