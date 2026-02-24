// Ported from Node.js: fixtures/es-module-loaders/loader-load-foo-or-42.mjs
// A load hook that short-circuits non-internal imports with synthetic source.
export async function load(url, _context, next) {
  if (url !== 'node:os') {
    return next(url);
  }

  return {
    format: 'module',
    shortCircuit: true,
    source: 'export default "from-require-hook"',
  };
}
