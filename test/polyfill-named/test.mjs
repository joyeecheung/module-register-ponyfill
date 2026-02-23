// Tests that the polyfill works when using the named import pattern:
//   import { register } from 'node:module'
// This is the pattern shown in the README. If ESM named exports from
// node:module are snapshots (not live bindings), register() would be
// the original unpatched version and the hook would not take effect.

import { test } from 'node:test';
import '../../src/polyfill.js';
import { register } from 'node:module';

const handle = register('./hook.mjs', import.meta.url);

test('polyfill: named import { register } from node:module works', async (t) => {
  t.plan(2);
  // The polyfill returns a handle with deregister(); native register() returns undefined.
  // This proves we are actually calling the polyfill, not the built-in.
  t.assert.strictEqual(typeof handle.deregister, 'function');
  const mod = await import('virtual:hello');
  t.assert.strictEqual(mod.message, 'hello from virtual module');
});
