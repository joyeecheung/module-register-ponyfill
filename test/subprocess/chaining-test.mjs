// Test subprocess: register two tagging hooks, verify LIFO order.
import { register } from '../../src/index.js';
import { pathToFileURL } from 'node:url';

// Register hook-a first, then hook-b.
// LIFO order means hook-b runs first (outermost), then hook-a.
register('../fixtures/tagging-hook.mjs', import.meta.url, {
  data: { tag: 'hook-a' },
});
register(
  `../fixtures/tagging-hook.mjs?v=2`,
  import.meta.url,
  { data: { tag: 'hook-b' } },
);

// Import the sample module -- both hooks tag the source.
const mod = await import('../fixtures/sample-module.js');
console.log(JSON.stringify({ value: mod.value }));
