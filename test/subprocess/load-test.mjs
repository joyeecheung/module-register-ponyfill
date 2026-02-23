// Test subprocess: register the load hook, then import a .txt file.
import { register } from '../../src/index.js';

register('../fixtures/load-hook.mjs', import.meta.url);

const mod = await import(new URL('../fixtures/test.txt', import.meta.url).href);
console.log(JSON.stringify({ default: mod.default }));
