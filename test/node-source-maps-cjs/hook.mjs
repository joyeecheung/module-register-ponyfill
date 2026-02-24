// Ported from Node.js: fixtures/es-module-loaders/loader-load-source-maps.mjs
// Load hook that provides source content for CommonJS modules so that
// --enable-source-maps can process their source map comments.
// Without this hook, Node.js does not expose CJS source to the source map handler.
import { readFile } from 'node:fs/promises';

export async function load(url, context, next) {
  const result = await next(url, context);
  if (context.format === 'commonjs') {
    result.source = await readFile(new URL(url));
  }
  return result;
}
