import { test } from 'node:test';
import { register } from '../../index.js';

register('./hook.mjs', import.meta.url);

test('resolve: redirect virtual specifier to a real module', async (t) => {
  t.plan(1);
  const mod = await import('virtual:hello');
  t.assert.strictEqual(mod.message, 'hello from virtual module');
});
