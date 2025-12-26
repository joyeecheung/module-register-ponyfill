/**
 * Test: process exits cleanly without hanging
 */
import { register, waitForReady } from '../../index.js';

register('./hooks/initialize-hook.mjs', {
  parentURL: import.meta.url,
  data: { test: true },
});

await waitForReady();
console.log('exiting cleanly');
