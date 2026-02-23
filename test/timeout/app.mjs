// Subprocess script: registers a hanging hook and tries to import through it.
// Expects MODULE_REGISTER_TIMEOUT_MS to be set to a short value.
// Should throw a timeout error.

import { register } from '../../index.js';

register('./hook.mjs', import.meta.url);

try {
  await import('hang:forever');
  // Should not reach here.
  process.exit(1);
} catch (err) {
  if (/Timed out/.test(err.message)) {
    // Print the error message so the test can verify it.
    console.log(err.message);
    process.exit(0);
  }
  // Unexpected error.
  console.error('Unexpected error:', err);
  process.exit(2);
}
