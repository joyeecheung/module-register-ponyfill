// Ported from Node.js: test-async-loader-hooks-throw-symbol.mjs
// Tests that a hook module whose top-level throws a Symbol propagates
// the error to the register() caller.
import { test } from 'node:test';
import { register } from '../../index.js';

test('node-throw-symbol: hook module throwing Symbol propagates to register()', async (t) => {
  t.plan(1);
  t.assert.throws(() => register('./hook.mjs', import.meta.url), {
    message: /Symbol\(symbol descriptor\)/,
  });
});
