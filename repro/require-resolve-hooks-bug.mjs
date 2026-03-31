// Minimal reproduction: registerHooks() resolve hook is NOT called for require.resolve()
//
// Expected: registerHooks resolve hook fires for require.resolve() calls
// Actual:   require.resolve() bypasses registerHooks resolve hooks entirely
//
// Tested on: Node.js v24.13.0, v25.6.1

import module from 'node:module';
import { createRequire } from 'node:module';

let resolveCount = 0;

module.registerHooks({
  resolve(specifier, context, nextResolve) {
    resolveCount++;
    console.log(`resolve hook called: ${specifier}`);
    return nextResolve(specifier, context);
  },
});

const require = createRequire(import.meta.url);

resolveCount = 0;
console.log('\n--- require("node:path") ---');
require('node:path');
console.log(`resolve hook called ${resolveCount} time(s)`); // 1 (works)

resolveCount = 0;
console.log('\n--- require.resolve("node:url") ---');
require.resolve('node:url');
console.log(`resolve hook called ${resolveCount} time(s)`); // 0 (bug: should be 1)

resolveCount = 0;
console.log('\n--- import("node:os") ---');
await import('node:os');
console.log(`resolve hook called ${resolveCount} time(s)`); // 1 (works)
