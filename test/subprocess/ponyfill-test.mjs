// Test subprocess: use the ponyfill entry point to patch module.register,
// then call the patched module.register() to verify it works.
import '../../src/ponyfill.js';
import nodeModule from 'node:module';

// module.register should now be our ponyfill.
nodeModule.register('../fixtures/resolve-hook.mjs', import.meta.url);

const mod = await import('virtual:hello');
console.log(JSON.stringify({ message: mod.message }));
