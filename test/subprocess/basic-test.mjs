// Test subprocess: register a basic hook, import a normal module.
import { register } from '../../src/index.js';

register('../fixtures/load-hook.mjs', import.meta.url);

// Import a normal JS module -- the hook should pass through to default.
const mod = await import('../fixtures/sample-module.js');
console.log(JSON.stringify({ value: mod.value }));
