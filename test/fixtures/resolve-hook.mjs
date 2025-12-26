/**
 * Test: resolve hook for virtual modules
 */
import { register, waitForReady } from '../../index.js';

register('./hooks/resolve-hook.mjs', {
  parentURL: import.meta.url,
});

await waitForReady();

try {
  const mod = await import('virtual:test-module');
  console.log('virtual module loaded:', mod.value);
} catch (err) {
  console.log('import failed:', err.message);
}
