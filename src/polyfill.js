// Polyfill entry point.
// Patches `module.register` with the polyfill implementation so that
// existing code using `module.register()` works without modification.
//
// In Node.js, module.register is wired in lib/module.js:
// https://github.com/nodejs/node/blob/6b5178f7/lib/module.js#L25
//
// IMPORTANT: This module must be loaded before any register() calls.
// Use --import to guarantee it runs first, or place the import before
// any module that calls register().
//
// Usage:
//   import 'module-register-ponyfill/polyfill';
//   // or: node --import module-register-ponyfill/polyfill
//   // now module.register() uses the polyfill

import { isPonyfillLoaderWorker } from './constants.js';

if (!isPonyfillLoaderWorker) {
  // Patch module.register only outside the ponyfill's loader worker.
  // Inside the loader worker, --import preloads have already been stripped
  // from execArgv (so this file should not even execute). The guard is
  // defense-in-depth in case NODE_OPTIONS or other mechanisms cause it
  // to load.
  const nodeModule = await import('node:module');
  const { register } = await import('./register.js');
  nodeModule.default.register = register;

  // Flush the patched default export to ESM named exports so that
  // `import { register } from 'node:module'` picks up the polyfill.
  // Without this, named imports remain bound to the original built-in.
  nodeModule.default.syncBuiltinESMExports();
}
