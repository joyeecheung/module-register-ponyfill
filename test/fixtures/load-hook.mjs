/**
 * Test: load hook transforms module source
 */
import { register, waitForReady } from '../../index.js';

register('./hooks/load-hook.mjs', {
  parentURL: import.meta.url,
});

await waitForReady();

try {
  const mod = await import('./modules/sample.mjs');
  console.log('module loaded:', mod.message);
} catch (err) {
  console.log('import failed:', err.message);
}
