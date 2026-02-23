// Ponyfill entry point.
// Patches `module.register` with the ponyfill implementation so that
// existing code using `module.register()` works without modification.
//
// Usage:
//   import 'module-register-ponyfill/ponyfill';
//   // now module.register() uses the ponyfill

import nodeModule from 'node:module';
import { register } from './index.js';

nodeModule.register = register;
