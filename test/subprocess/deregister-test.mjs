// Test subprocess: register a hook, verify it works, deregister it, verify
// the hook is no longer active.
import { register } from '../../src/index.js';

const handle = register('../fixtures/virtual-module-hook.mjs', import.meta.url);

// The hook should be active -- virtual:greeting should resolve.
const mod = await import('virtual:greeting');
const before = mod.greeting;

// Deregister the hook.
handle.deregister();

// The hook should be gone -- importing virtual:greeting should fail.
let afterError = null;
try {
  // Use a unique specifier so it's not cached from the previous import.
  await import('virtual:greeting?after');
} catch (err) {
  afterError = err.message;
}

console.log(JSON.stringify({
  before,
  deregistered: afterError !== null,
}));
