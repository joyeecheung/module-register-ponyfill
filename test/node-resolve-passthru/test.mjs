// Ported from Node.js: test-async-loader-hooks-register-with-import.mjs
// Tests that register() works and hooks fire on subsequent imports.
import { test } from 'node:test';
import { register } from '../../index.js';

const shared = new SharedArrayBuffer(4);
register('./hook.mjs', {
  parentURL: import.meta.url,
  data: { shared },
  transferList: [],
});

test('node-resolve-passthru: register a resolve passthru hook via register()', async (t) => {
  t.plan(2);
  const view = new Int32Array(shared);
  const before = Atomics.load(view, 0);
  await import('node:os');
  const after = Atomics.load(view, 0);
  t.assert.ok(after > before, `resolve hook should fire (before=${before}, after=${after})`);
  t.assert.ok(after >= 1, 'resolve hook called at least once');
});
