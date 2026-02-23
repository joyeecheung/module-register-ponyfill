import { test } from 'node:test';
import { register } from '../../src/index.js';

register('./hook.mjs', import.meta.url);

test('virtual-module: resolve + load a fully synthetic module with no backing file', async (t) => {
  t.plan(1);
  const mod = await import('virtual:greeting');
  t.assert.strictEqual(mod.greeting, 'hello from virtual land');
});
