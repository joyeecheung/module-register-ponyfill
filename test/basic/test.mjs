import { test } from 'node:test';
import { register } from '../../src/index.js';

register('./hook.mjs', import.meta.url);

test('basic: register a hook and import a normal module through default chain', async (t) => {
  t.plan(1);
  // Import a normal JS module -- the hook should pass through to default.
  const mod = await import('./sample.js');
  t.assert.strictEqual(mod.value, 42);
});
