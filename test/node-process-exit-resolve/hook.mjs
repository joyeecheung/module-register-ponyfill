// Ported from Node.js: fixtures/es-module-loaders/loader-exit-on-resolve.mjs
export function resolve(specifier, context, next) {
  if (specifier === 'exit:') process.exit(42);
  return next(specifier, context);
}
