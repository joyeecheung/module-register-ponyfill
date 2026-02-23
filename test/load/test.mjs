import { test } from 'node:test';
import { register } from '../../src/index.js';

register('./hook.mjs', import.meta.url);

test('load: intercept .txt files and serve custom source', async (t) => {
  t.plan(1);
  const mod = await import(new URL('./test.txt', import.meta.url).href);
  t.assert.strictEqual(mod.default, 'content of fake txt');
});
