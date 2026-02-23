// Ported from Node.js: test-async-loader-hooks-initialize-throw-null.mjs
// Tests that a register() call with a hook whose initialize() throws null
// propagates the error.
import { test } from 'node:test';
import { register } from '../../index.js';

test('node-initialize-throw-null: initialize() throwing null throws on register()', async (t) => {
  t.plan(1);
  t.assert.throws(
    () => register('./hook.mjs', import.meta.url),
    (err) => err instanceof Error,
  );
});
