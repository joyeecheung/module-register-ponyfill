// Ported from Node.js: fixtures/es-module-loaders/hooks-input.mjs
// Tests resolve/load hooks receive the expected arguments.
//
// Adapted from the Node.js version:
// - Removed importAssertions check (deprecated, not present via ponyfill).
// - Context keys match what registerHooks() provides rather than
//   --experimental-loader.
// - Uses writeSync(1, ...) to emit JSON to stdout for the test to validate.
import assert from 'node:assert';
import { writeSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

let resolveCalls = 0;
let loadCalls = 0;

export async function resolve(specifier, context, next) {
  resolveCalls++;
  let url;

  if (resolveCalls === 1) {
    url = new URL(specifier).href;
    assert.match(specifier, /json-modules\.mjs$/);
    assert.deepStrictEqual(context.importAttributes, {});
  } else if (resolveCalls === 2) {
    url = new URL(specifier, context.parentURL).href;
    assert.match(specifier, /experimental\.json$/);
    assert.match(context.parentURL, /json-modules\.mjs$/);
    assert.deepStrictEqual(context.importAttributes, {
      type: 'json',
    });
  } else {
    throw new Error(`Unexpected resolve call: ${specifier}`);
  }

  assert.ok(Array.isArray(context.conditions));
  assert.ok(context.importAttributes !== undefined);
  assert.strictEqual(typeof next, 'function');

  const returnValue = {
    url,
    format: 'test',
    shortCircuit: true,
  };

  writeSync(1, JSON.stringify(returnValue) + '\n');
  return returnValue;
}

export async function load(url, context, next) {
  loadCalls++;
  const source = await readFile(fileURLToPath(url));
  let format;

  if (loadCalls === 1) {
    assert.match(url, /json-modules\.mjs$/);
    assert.deepStrictEqual(context.importAttributes, {});
    format = 'module';
  } else if (loadCalls === 2) {
    assert.match(url, /experimental\.json$/);
    assert.deepStrictEqual(context.importAttributes, {
      type: 'json',
    });
    format = 'json';
  }

  assert.ok(new URL(url));
  assert.strictEqual(context.format, 'test');
  assert.ok(context.importAttributes !== undefined);
  assert.strictEqual(typeof next, 'function');

  const returnValue = {
    source,
    format,
    shortCircuit: true,
  };

  writeSync(1, JSON.stringify(returnValue) + '\n');
  return returnValue;
}
