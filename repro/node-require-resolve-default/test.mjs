// Ported from Node.js: test-async-loader-hooks-require-resolve-default.mjs
//
// Upstream behavior (native module.register):
//   require.resolve() does NOT go through async loader hooks by default.
//   Only the entry module resolution triggers the resolve hook (1 call).
//
// Ponyfill behavior:
//   Because the ponyfill uses registerHooks() (sync hooks), which intercepts
//   all module resolution including require.resolve(), the resolve hook IS
//   called for require.resolve() too.
import { test } from 'node:test';
import { createRequire } from 'node:module';
import { register } from '../../index.js';

const shared = new SharedArrayBuffer(4);
register('./hook.mjs', {
  parentURL: import.meta.url,
  data: { shared },
  transferList: [],
});

const require = createRequire(import.meta.url);

test('node-require-resolve-default: require.resolve() goes through ponyfill resolve hook', async (t) => {
  t.plan(1);

  const view = new Int32Array(shared);
  const before = Atomics.load(view, 0);

  // In native Node.js with module.register(), this would NOT trigger the
  // async resolve hook. In the ponyfill it does, because registerHooks()
  // sync hooks intercept all resolution.
  require.resolve('node:path');

  const after = Atomics.load(view, 0);
  t.assert.ok(
    after > before,
    'ponyfill resolve hook should be called for require.resolve() ' +
      `(calls before=${before}, after=${after})`,
  );
});
