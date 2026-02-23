import { test } from 'node:test';
import { register } from '../../src/index.js';

const handle = register('./hook.mjs', import.meta.url);

test('deregister: removing a hook makes it stop participating in resolution', async (t) => {
  t.plan(2);
  // The hook should be active -- virtual:greeting should resolve.
  const mod = await import('virtual:greeting');
  t.assert.strictEqual(mod.greeting, 'hello from virtual land');

  handle.deregister();

  // The hook should be gone -- importing virtual:greeting should fail.
  // Use a unique specifier so it's not cached from the previous import.
  await t.assert.rejects(
    () => import('virtual:greeting?after'),
    'expected import to fail after deregister',
  );
});
