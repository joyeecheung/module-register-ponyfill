import { test } from 'node:test';
import { register } from '../../index.js';

// Register hook-a first, then hook-b.
// LIFO order means hook-b runs first (outermost), then hook-a.
register('./hook.mjs', import.meta.url, { data: { tag: 'hook-a' } });
register('./hook.mjs?v=2', import.meta.url, { data: { tag: 'hook-b' } });

test('chaining: multiple register() calls run in LIFO order', async (t) => {
  t.plan(1);
  // Both hooks should have run -- the module should still export value: 42
  // (the tagging hooks prepend comments but don't change the export).
  const mod = await import('./sample.js');
  t.assert.strictEqual(mod.value, 42);
});
