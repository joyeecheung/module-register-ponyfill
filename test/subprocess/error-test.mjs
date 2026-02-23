// Test subprocess: register a hook that throws, verify error propagation.
import { register } from '../../src/index.js';

register('../fixtures/error-hook.mjs', import.meta.url);

try {
  // The error hook throws on .broken URLs
  await import(new URL('../fixtures/test.broken', import.meta.url).href);
  console.log(JSON.stringify({ error: false }));
} catch (err) {
  console.log(JSON.stringify({
    error: true,
    message: err.message,
  }));
}
