// Ported from Node.js: fixtures/es-module-loaders/loader-load-foo-or-42.mjs
// A load hook that short-circuits and returns synthetic module source.
export async function load(url, _context, next) {
  if (url === 'node:fs' || url.includes('hook')) {
    return next(url);
  }

  const val = url.includes('42') ? '42' : '"foo"';

  return {
    format: 'module',
    shortCircuit: true,
    source: `export default ${val}`,
  };
}
