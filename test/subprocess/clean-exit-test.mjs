// Test subprocess: verify the process exits cleanly after registering hooks.
// If the worker is not properly unref'd, this process will hang and the test
// runner's timeout will kill it.
import { register } from '../../src/index.js';

register('../fixtures/resolve-hook.mjs', import.meta.url);

// If we reach here without hanging, the process exits cleanly.
console.log(JSON.stringify({ exited: true }));
