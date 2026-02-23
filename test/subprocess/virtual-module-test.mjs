// Test subprocess: register a virtual module hook, import a module with no
// backing file, and verify the source is served entirely by the hook.
import { register } from '../../src/index.js';

register('../fixtures/virtual-module-hook.mjs', import.meta.url);

const mod = await import('virtual:greeting');
console.log(JSON.stringify({ greeting: mod.greeting }));
