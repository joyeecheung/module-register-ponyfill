// App loaded via: node --import ../../src/polyfill.js app-named.mjs
// Tests that `import { register } from 'node:module'` gets the polyfilled
// version when the polyfill was loaded via --import.

import { strict as assert } from 'node:assert';
import { register } from 'node:module';

// If named exports from node:module are snapshots captured at module load
// time, this register() would be the original Node.js register(), not the
// polyfill. The --import preload phase runs the polyfill before this module
// is even parsed, so this tests whether the patch survives across phases.
const handle = register('./hook.mjs', import.meta.url);

// The polyfill returns a handle with deregister(); native register() returns undefined.
// This proves we are actually calling the polyfill, not the built-in.
assert.strictEqual(typeof handle.deregister, 'function');

const mod = await import('virtual:hello');
assert.strictEqual(mod.message, 'hello from virtual module');
