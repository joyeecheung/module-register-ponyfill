// Main-thread entry point.
// Exports the public register() function -- a drop-in replacement for
// module.register().
//
// Mirrors the top-level register() in Node.js's loader.js:
// https://github.com/nodejs/node/blob/6b5178f7/lib/internal/modules/esm/loader.js#L955-L967
//
// Delegates to ModuleLoader (in loader.js) which mirrors Node.js's
// ModuleLoader class with its lazy AsyncLoaderHooksProxiedToLoaderHookWorker
// creation pattern.

import { getOrInitializeModuleLoader } from './loader.js';

/**
 * Register a module that exports hooks to customize Node.js module resolution
 * and loading. Drop-in replacement for `module.register()`.
 *
 * Mirrors the top-level register() function in Node.js loader.js:
 * https://github.com/nodejs/node/blob/6b5178f7/lib/internal/modules/esm/loader.js#L955-L967
 *
 * Supports both calling conventions:
 *   register(specifier, parentURL, options)
 *   register(specifier, options)
 *
 * @param {string|URL} specifier
 * @param {string|URL|object} [parentURLOrOptions]
 * @param {object} [options]
 */
export function register(specifier, parentURLOrOptions, options) {
  // Normalize arguments -- mirrors Node.js's register() argument parsing.
  // https://github.com/nodejs/node/blob/6b5178f7/lib/internal/modules/esm/loader.js#L956-L960
  let parentURL;
  let data;
  let transferList;

  if (
    parentURLOrOptions !== undefined &&
    typeof parentURLOrOptions === 'object' &&
    !isURL(parentURLOrOptions)
  ) {
    // 2-arg form: register(specifier, { parentURL, data, transferList })
    options = parentURLOrOptions;
    parentURL = options.parentURL;
    data = options.data;
    transferList = options.transferList;
  } else {
    // 3-arg form: register(specifier, parentURL, options)
    parentURL = parentURLOrOptions;
    if (options) {
      // Also check if parentURL was inside options (mixed usage)
      if (!parentURL && options.parentURL) {
        parentURL = options.parentURL;
      }
      data = options.data;
      transferList = options.transferList;
    }
  }

  // Default parentURL to 'data:' like Node.js does.
  if (parentURL === undefined || parentURL === null) {
    parentURL = 'data:';
  }

  // Convert URL objects to strings.
  if (typeof specifier !== 'string') {
    specifier = String(specifier);
  }
  if (typeof parentURL !== 'string') {
    parentURL = String(parentURL);
  }

  // Delegate to the singleton ModuleLoader.
  return getOrInitializeModuleLoader().register(specifier, parentURL, data, transferList);
}

/**
 * Check if a value is a URL instance.
 * @param {any} value
 * @returns {boolean}
 */
function isURL(value) {
  return value instanceof URL;
}
