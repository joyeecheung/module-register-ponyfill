// App script loaded via: node --import ../../src/polyfill.js app.mjs
// The polyfill should already have patched module.register by the time
// this script runs.
import { strict as assert } from 'node:assert';
import nodeModule from 'node:module';

// Use the patched module.register() to register a hook.
nodeModule.register('./hook.mjs', import.meta.url);

const mod = await import('virtual:hello');
assert.strictEqual(mod.message, 'hello from virtual module');
