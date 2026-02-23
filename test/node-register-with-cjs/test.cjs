// Ported from Node.js: test-async-loader-hooks-register-with-cjs.mjs
// Tests that register() works when called from a CJS entry point.
'use strict';
const { test } = require('node:test');
const { register } = require('../../index.js');
const { pathToFileURL } = require('node:url');

const parentURL = pathToFileURL(__filename).href;
const shared = new SharedArrayBuffer(4);

register('./hook-initialize.mjs', {
  parentURL,
  data: { shared },
  transferList: [],
});
register('./hook-load.mjs', parentURL);

test('node-register-with-cjs: register() works from CJS context', async (t) => {
  t.plan(2);
  const view = new Int32Array(shared);
  // initialize() from the first hook should have been called.
  t.assert.strictEqual(view[0], 1, 'initialize() called once');
  // The load hook short-circuits node:os to return `export default "foo"`.
  const mod = await import('node:os');
  t.assert.strictEqual(mod.default, 'foo', 'load hook replaced module');
});
