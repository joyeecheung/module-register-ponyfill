// Ported from Node.js: test-async-loader-hooks-throw-empty-object.mjs
// Tests that a hook module whose top-level throws an empty object propagates
// the error to the register() caller.
import { test } from 'node:test';
import { register } from '../../index.js';

test('node-throw-empty-object: hook module throwing empty object propagates to register()', async (t) => {
  t.plan(1);
  t.assert.throws(() => register('./hook.mjs', import.meta.url), { message: /\[object Object\]/ });
});
