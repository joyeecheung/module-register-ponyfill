// Ported from Node.js: test-async-loader-hooks-throw-boolean.mjs
// Tests that a hook module whose top-level throws a boolean propagates
// the error to the register() caller.
import { test } from 'node:test';
import { register } from '../../index.js';

test('node-throw-boolean: hook module throwing boolean propagates to register()', async (t) => {
  t.plan(1);
  t.assert.throws(() => register('./hook.mjs', import.meta.url), { message: /true/ });
});
