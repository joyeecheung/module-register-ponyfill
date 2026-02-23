import { test } from 'node:test';
import { register } from '../../index.js';

// This hook has both resolve and load, but calls nextResolve/nextLoad for
// everything -- verifying bidirectional communication works.
register('./hook.mjs', import.meta.url, { data: { tag: 'pass-through' } });

test('next-default: hook that calls nextResolve/nextLoad works correctly', async (t) => {
  t.plan(1);
  const mod = await import('./sample.js');
  t.assert.strictEqual(mod.value, 42);
});
