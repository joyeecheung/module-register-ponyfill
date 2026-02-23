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

import nodeModule from 'node:module';
import { register } from './register.js';

nodeModule.register = register;

// Flush the patched default export to ESM named exports so that
// `import { register } from 'node:module'` picks up the polyfill.
// Without this, named imports remain bound to the original built-in.
nodeModule.syncBuiltinESMExports();
