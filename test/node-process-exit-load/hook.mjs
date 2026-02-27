// Ported from Node.js: fixtures/es-module-loaders/loader-exit-on-load.mjs
export function load(url, context, next) {
  if (url === 'data:exit') process.exit(42);
  return next(url, context);
}
