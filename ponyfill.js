/**
 * Ponyfill for `module.register()` using `module.registerHooks()` and Worker threads.
 */

import { register } from './index.js';
import module from 'node:module';

module.register = register;
