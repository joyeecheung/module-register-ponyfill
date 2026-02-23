// Tests the "reverse order" case: node:module is imported BEFORE the polyfill
// in the static import list. ESM evaluation order is based on the dependency
// graph, not textual order of import statements, but this makes the intent
// explicit and tests whether the polyfill can patch a module that was already
// evaluated.

import { register } from 'node:module';
import { test } from 'node:test';
import '../../src/polyfill.js';

// By the time this line executes, the polyfill has patched nodeModule.register.
// syncBuiltinESMExports() should have flushed the patch to the named binding.
const handle = register('./hook.mjs', import.meta.url);

test('polyfill: named import works even when node:module appears first', async (t) => {
  t.plan(2);
  // The polyfill returns a handle with deregister(); native register() returns undefined.
  // This proves we are actually calling the polyfill, not the built-in.
  t.assert.strictEqual(typeof handle.deregister, 'function');
  const mod = await import('virtual:hello');
  t.assert.strictEqual(mod.message, 'hello from virtual module');
});
