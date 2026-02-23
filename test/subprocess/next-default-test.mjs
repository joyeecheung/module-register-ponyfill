// Test subprocess: register a hook that delegates to the default resolve/load.
import { register } from '../../src/index.js';

// This hook has both resolve and load, but calls nextResolve/nextLoad for
// everything -- verifying bidirectional communication works.
register('../fixtures/tagging-hook.mjs', import.meta.url, {
  data: { tag: 'pass-through' },
});

const mod = await import('../fixtures/sample-module.js');
console.log(JSON.stringify({ value: mod.value }));
