// Ported from Node.js: test-async-loader-hooks-throw-error.mjs
// Tests that a hook module whose top-level throws an Error propagates
// the error to the register() caller.
import { test } from 'node:test';
import { register } from '../../index.js';

test('node-throw-error: hook module throwing Error propagates to register()', async (t) => {
  t.plan(1);
  t.assert.throws(() => register('./hook.mjs', import.meta.url), { message: /error message/ });
});
