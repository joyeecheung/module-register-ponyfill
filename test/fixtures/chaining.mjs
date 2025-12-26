/**
 * Test: chaining multiple hook registrations
 */
import { register, waitForReady } from '../../index.js';

register('./hooks/chain-hook1.mjs', {
  parentURL: import.meta.url,
});

register('./hooks/chain-hook2.mjs', {
  parentURL: import.meta.url,
});

await waitForReady();
console.log('test completed');
