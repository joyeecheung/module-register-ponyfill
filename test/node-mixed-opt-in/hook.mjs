// Ported from Node.js: fixtures/es-module-loaders/loader-mixed-opt-in.mjs
// Resolve hook returns a virtual CJS module; load hook provides synthetic
// source that require()s a real file and logs "Hello".
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const emptyPath = join(fileURLToPath(import.meta.url), '..', 'empty.js');

export function resolve(specifier, context, next) {
  if (specifier.endsWith('entry-point')) {
    return {
      shortCircuit: true,
      url: 'file:///c:/virtual-entry-point',
      format: 'commonjs',
    };
  }
  return next(specifier, context);
}

export async function load(url, context, next) {
  if (url === 'file:///c:/virtual-entry-point') {
    return {
      shortCircuit: true,
      source: `"use strict";require(${JSON.stringify(emptyPath)});console.log("Hello");`,
      format: 'commonjs',
    };
  }
  return next(url, context);
}
