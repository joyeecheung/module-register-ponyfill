import { test } from 'node:test';
import '../../src/polyfill.js';
import nodeModule from 'node:module';

// module.register should now be our polyfill.
nodeModule.register('./hook.mjs', import.meta.url);

test('polyfill: importing polyfill entry patches module.register()', async (t) => {
  t.plan(1);
  const mod = await import('virtual:hello');
  t.assert.strictEqual(mod.message, 'hello from virtual module');
});
