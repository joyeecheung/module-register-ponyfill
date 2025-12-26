/**
 * Test: initialize hook receives data correctly
 */
import { register, waitForReady } from '../../index.js';

register('./hooks/initialize-hook.mjs', {
  parentURL: import.meta.url,
  data: { greeting: 'Hello from test' },
});

await waitForReady();
console.log('test completed');
