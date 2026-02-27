// Ported from Node.js: test-async-loader-hooks-throw-object.mjs
// Tests that a hook module whose top-level throws a plain object propagates
// the error to the register() caller.
import { test } from 'node:test';
import { register } from '../../index.js';

test('node-throw-object: hook module throwing object propagates to register()', async (t) => {
  t.plan(1);
  t.assert.throws(() => register('./hook.mjs', import.meta.url), { message: /\[object Object\]/ });
});
