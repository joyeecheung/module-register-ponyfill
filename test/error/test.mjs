import { test } from 'node:test';
import { register } from '../../src/index.js';

register('./hook.mjs', import.meta.url);

test('error: hook errors propagate to the main thread', async (t) => {
  t.plan(1);
  // The error hook throws on .broken URLs.
  await t.assert.rejects(
    import(new URL('./test.broken', import.meta.url).href),
    { message: /Intentional hook error/ },
  );
});
