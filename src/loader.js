// ModuleLoader -- the main-thread entry point for module resolution and loading.
//
// Mirrors Node.js's ModuleLoader class from loader.js:
// https://github.com/nodejs/node/blob/6b5178f7/lib/internal/modules/esm/loader.js#L156-L811
//
// Key methods that parallel Node.js:
// - register(): lazily creates AsyncLoaderHooksProxiedToLoaderHookWorker
//   and delegates to it (mirroring L652-L661).
// - #resolveAndMaybeBlockOnLoaderThread(): default resolve step for
//   registerHooks() that blocks on the worker if async hooks exist
//   (mirroring L710-L726).
// - #loadAndMaybeBlockOnLoaderThread(): same for load (mirroring L769-L775).
//
// Key differences from Node.js:
// - Uses registerHooks() to install sync proxy hooks instead of being called
//   by the internal module loading pipeline directly.
// - Includes hook tracking (#hasResolveHooks / #hasLoadHooks) to skip the
//   worker round-trip when no async hooks of that type are registered.
// - Supports deregister (not available in native Node.js).
//
// The singleton is exposed via getOrInitializeModuleLoader(), which mirrors
// getOrInitializeCascadedLoader() in Node.js:
// https://github.com/nodejs/node/blob/6b5178f7/lib/internal/modules/esm/loader.js#L908-L921

import { registerHooks } from 'node:module';
import { AsyncLoaderHooksProxiedToLoaderHookWorker } from './hooks.js';

// ===========================================================================
// ModuleLoader
// ===========================================================================

/**
 * Main-thread module loader. Owns the relationship between sync hooks
 * (registered via registerHooks()) and async hooks (running on the worker
 * thread via AsyncLoaderHooksProxiedToLoaderHookWorker).
 *
 * Mirrors Node.js's ModuleLoader:
 * https://github.com/nodejs/node/blob/6b5178f7/lib/internal/modules/esm/loader.js#L156-L811
 */
class ModuleLoader {
  /**
   * Lazily created on first register() call.
   * Mirrors #asyncLoaderHooks in Node.js:
   * https://github.com/nodejs/node/blob/6b5178f7/lib/internal/modules/esm/loader.js#L194
   * @type {AsyncLoaderHooksProxiedToLoaderHookWorker | null}
   */
  #asyncLoaderHooks = null;

  // Whether any hooks with resolve/load have been registered.
  // Used to skip the worker round-trip when no hooks of that type exist.
  #hasResolveHooks = false;
  #hasLoadHooks = false;

  // Whether registerHooks() has been called (one-time setup).
  #hooksRegistered = false;

  /**
   * Register a hook module on the worker.
   *
   * Mirrors ModuleLoader#register in Node.js which lazily creates
   * AsyncLoaderHooksProxiedToLoaderHookWorker and delegates:
   * https://github.com/nodejs/node/blob/6b5178f7/lib/internal/modules/esm/loader.js#L652-L661
   *
   * @param {string} specifier
   * @param {string} parentURL
   * @param {any} [data]
   * @param {Transferable[]} [transferList]
   * @returns {{ deregister: () => void }}
   */
  register(specifier, parentURL, data, transferList) {
    if (!this.#asyncLoaderHooks) {
      this.#asyncLoaderHooks = new AsyncLoaderHooksProxiedToLoaderHookWorker();
    }

    const result = this.#asyncLoaderHooks.register(specifier, parentURL, data, transferList);

    // Track what kind of hooks were registered so the proxy hooks know
    // whether to delegate to the worker or short-circuit.
    if (result?.hasResolve) {
      this.#hasResolveHooks = true;
    }
    if (result?.hasLoad) {
      this.#hasLoadHooks = true;
    }
    // If the response doesn't have hook info (e.g. older protocol), assume both.
    if (!result) {
      this.#hasResolveHooks = true;
      this.#hasLoadHooks = true;
    }

    // Register the sync hooks once we know there are async hooks.
    this.#ensureHooksRegistered();

    // Return a handle that can deregister this hook -- a nice-to-have that
    // the native module.register() does not offer.
    const hookId = result?.hookId ?? -1;
    return {
      deregister: () => this.#deregister(hookId),
    };
  }

  /**
   * Default resolve step for registerHooks() -- blocks on the loader hook
   * worker thread if async hooks are registered.
   *
   * Mirrors ModuleLoader#resolveAndMaybeBlockOnLoaderThread in Node.js:
   * https://github.com/nodejs/node/blob/6b5178f7/lib/internal/modules/esm/loader.js#L710-L726
   *
   * Key difference: accepts nextResolve (the registerHooks chain's next step)
   * and passes it through for bidirectional communication with the worker.
   *
   * @param {string} specifier
   * @param {object} context
   * @param {Function} nextResolve  registerHooks chain's next resolve.
   * @returns {object}
   */
  #resolveAndMaybeBlockOnLoaderThread(specifier, context, nextResolve) {
    if (this.#asyncLoaderHooks && this.#hasResolveHooks) {
      return this.#asyncLoaderHooks.resolveSync(specifier, context, nextResolve);
    }
    return nextResolve(specifier, context);
  }

  /**
   * Default load step for registerHooks() -- blocks on the loader hook
   * worker thread if async hooks are registered.
   *
   * Mirrors ModuleLoader#loadAndMaybeBlockOnLoaderThread in Node.js:
   * https://github.com/nodejs/node/blob/6b5178f7/lib/internal/modules/esm/loader.js#L769-L775
   *
   * @param {string} url
   * @param {object} context
   * @param {Function} nextLoad  registerHooks chain's next load.
   * @returns {object}
   */
  #loadAndMaybeBlockOnLoaderThread(url, context, nextLoad) {
    if (this.#asyncLoaderHooks && this.#hasLoadHooks) {
      return this.#asyncLoaderHooks.loadSync(url, context, nextLoad);
    }
    return nextLoad(url, context);
  }

  /**
   * Register the single pair of sync hooks via registerHooks() (called once).
   * These hooks proxy to the worker's async hook chain via the methods above.
   */
  #ensureHooksRegistered() {
    if (this.#hooksRegistered) return;
    this.#hooksRegistered = true;

    registerHooks({
      resolve: (specifier, context, nextResolve) =>
        this.#resolveAndMaybeBlockOnLoaderThread(specifier, context, nextResolve),
      load: (url, context, nextLoad) =>
        this.#loadAndMaybeBlockOnLoaderThread(url, context, nextLoad),
    });
  }

  /**
   * Deregister a previously registered hook module.
   * Not available in native Node.js -- this is a ponyfill extension.
   *
   * @param {number} hookId
   */
  #deregister(hookId) {
    const result = this.#asyncLoaderHooks.deregister(hookId);
    if (result) {
      this.#hasResolveHooks = result.hasResolve;
      this.#hasLoadHooks = result.hasLoad;
    }
  }
}

// ===========================================================================
// getOrInitializeModuleLoader (singleton)
// ===========================================================================

/**
 * Singleton ModuleLoader instance.
 * Mirrors cascadedLoader / getOrInitializeCascadedLoader() in Node.js:
 * https://github.com/nodejs/node/blob/6b5178f7/lib/internal/modules/esm/loader.js#L895-L921
 * @type {ModuleLoader | null}
 */
let moduleLoader = null;

/**
 * Get or create the singleton ModuleLoader.
 * @returns {ModuleLoader}
 */
export function getOrInitializeModuleLoader() {
  moduleLoader ??= new ModuleLoader();
  return moduleLoader;
}
