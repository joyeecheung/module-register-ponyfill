// Test subprocess: register the resolve hook, then import 'virtual:hello'.
import { register } from '../../src/index.js';

register('../fixtures/resolve-hook.mjs', import.meta.url);

const mod = await import('virtual:hello');
// Send result to parent via stdout.
console.log(JSON.stringify({ message: mod.message }));
