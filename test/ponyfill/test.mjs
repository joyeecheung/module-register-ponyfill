import { test } from 'node:test';
import '../../src/ponyfill.js';
import nodeModule from 'node:module';

// module.register should now be our ponyfill.
nodeModule.register('./hook.mjs', import.meta.url);

test('ponyfill: importing ponyfill entry patches module.register()', async (t) => {
  t.plan(1);
  const mod = await import('virtual:hello');
  t.assert.strictEqual(mod.message, 'hello from virtual module');
});
