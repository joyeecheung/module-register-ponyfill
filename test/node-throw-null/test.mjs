// Ported from Node.js: test-async-loader-hooks-throw-null.mjs
// Tests that a hook module whose top-level throws null propagates
// the error to the register() caller.
import { test } from 'node:test';
import { register } from '../../index.js';

test('node-throw-null: hook module throwing null propagates to register()', async (t) => {
  t.plan(1);
  t.assert.throws(() => register('./hook.mjs', import.meta.url), { message: /null/ });
});
