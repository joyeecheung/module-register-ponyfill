// Ported from Node.js: test-async-loader-hooks-initialize-rejecting.mjs
// Tests that a register() call with a hook whose initialize() returns a
// rejected promise propagates the error to the caller.
import { test } from 'node:test';
import { register } from '../../index.js';

test('node-initialize-rejecting: initialize() returning rejected promise throws', async (t) => {
  t.plan(1);
  t.assert.throws(
    () => register('./hook.mjs', import.meta.url),
    (err) => err instanceof Error,
  );
});
