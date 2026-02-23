// Ported from Node.js: test-async-loader-hooks-register-with-url-parenturl.mjs
// Tests that register() accepts URL objects (not just strings) as parentURL.
import { test } from 'node:test';
import { register } from '../../index.js';

register('./hook.mjs', new URL('./', import.meta.url));

test('node-url-parenturl: register() accepts URL object as parentURL', async (t) => {
  t.plan(1);
  // The hook is loader-load-foo-or-42. It short-circuits all non-internal
  // imports to return `export default "foo"`.
  const mod = await import('./dummy.mjs');
  t.assert.strictEqual(mod.default, 'foo');
});
