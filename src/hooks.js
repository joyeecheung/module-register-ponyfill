// Async loader hooks bridge.
//
// Mirrors Node.js's hooks.js:
// https://github.com/nodejs/node/blob/6b5178f7/lib/internal/modules/esm/hooks.js
//
// Contains three classes, matching Node.js's structure:
// - AsyncLoaderHooksOnLoaderHookWorker: worker-side class that holds the
//   #chains.resolve / #chains.load and runs LIFO async hook chains (L133-L488).
// - AsyncLoaderHookWorker: main-thread class that spawns the worker, owns
//   the SharedArrayBuffer, and provides makeSyncRequest (L493-L668).
// - AsyncLoaderHooksProxiedToLoaderHookWorker: main-thread class that
//   implements the AsyncLoaderHooks interface by proxying to the
//   AsyncLoaderHookWorker singleton (L802-L866).
//
// Also contains module-level helpers:
// - pluckHooks: extract resolve/load/initialize from hook module exports (L678-L724).
// - nextHookFactory: recursive chain builder (L726-L788).
// - getAsyncLoaderHookWorker: singleton accessor (L792-L796).

import { MessageChannel, receiveMessageOnPort, Worker } from 'node:worker_threads';
import { MSG, SHARED_MEMORY_BYTES, WAIT_TIMEOUT_MS, WORKER_TO_MAIN } from './constants.js';
import { deserializeError } from './errors.js';

// ===========================================================================
// AsyncLoaderHooksOnLoaderHookWorker (worker-thread side)
// ===========================================================================

/**
 * Worker-side class that holds the resolve/load hook chains and executes them
 * in LIFO order.
 *
 * Mirrors Node.js's AsyncLoaderHooksOnLoaderHookWorker:
 * https://github.com/nodejs/node/blob/6b5178f7/lib/internal/modules/esm/hooks.js#L133-L480
 *
 * Key differences from Node.js:
 * - Default resolve/load use captured built-in functions from registerHooks()
 *   rather than calling Node.js internal resolve/load via private symbols.
 * - Supports deregister() (not available in native Node.js).
 * - Omits shortCircuit/chainFinished tracking and deep validation since the
 *   main-thread registerHooks() layer handles those.
 */
export class AsyncLoaderHooksOnLoaderHookWorker {
  /**
   * LIFO hook chains. Each entry is a KeyedHook: { fn, url, next?, hookId? }.
   * Index 0 is always the default (captured Node.js built-in).
   * New hooks are pushed to the end with `next` pointing to the previous tail.
   *
   * Mirrors #chains in Node.js:
   * https://github.com/nodejs/node/blob/6b5178f7/lib/internal/modules/esm/hooks.js#L134-L163
   *
   * @type {{
   *   resolve: Array<{ fn: Function, url: string, next?: object, hookId?: number }>,
   *   load: Array<{ fn: Function, url: string, next?: object, hookId?: number }>,
   * }}
   */
  #chains;

  /** @type {number} */
  #nextHookId = 0;

  /**
   * @param {Function} defaultResolve  Captured Node.js built-in resolve.
   * @param {Function} defaultLoad     Captured Node.js built-in load.
   */
  constructor(defaultResolve, defaultLoad) {
    this.#chains = {
      resolve: [
        {
          fn: defaultResolve,
          url: 'node:default-resolve',
        },
      ],
      load: [
        {
          fn: defaultLoad,
          url: 'node:default-load',
        },
      ],
    };
  }

  /**
   * Import and register a custom loader hook module.
   *
   * Mirrors AsyncLoaderHooksOnLoaderHookWorker#register in Node.js:
   * https://github.com/nodejs/node/blob/6b5178f7/lib/internal/modules/esm/hooks.js#L173-L183
   *
   * @param {string} specifier  Hook module specifier.
   * @param {string} parentURL  Parent URL for resolution.
   * @param {any} [data]        Data passed to the hook's initialize().
   * @returns {Promise<{ hookId: number, hasResolve: boolean, hasLoad: boolean }>}
   */
  async register(specifier, parentURL, data) {
    const resolvedURL = new URL(specifier, parentURL).href;
    const keyedExports = await import(resolvedURL);
    const { hookId, hasResolve, hasLoad, initialize } = this.addCustomLoader(
      resolvedURL,
      keyedExports,
      data,
    );
    await initialize;
    return { hookId, hasResolve, hasLoad };
  }

  /**
   * Collect custom loader hooks from a module's exports.
   *
   * Mirrors AsyncLoaderHooksOnLoaderHookWorker#addCustomLoader in Node.js:
   * https://github.com/nodejs/node/blob/6b5178f7/lib/internal/modules/esm/hooks.js#L193-L214
   *
   * @param {string} url        Resolved URL of the hook module.
   * @param {object} exports    The hook module's exports.
   * @param {any} [data]        Data passed to the hook's initialize().
   * @returns {{ hookId: number, hasResolve: boolean, hasLoad: boolean, initialize: any }}
   */
  addCustomLoader(url, exports, data) {
    const { initialize, resolve, load } = pluckHooks(exports);
    const hookId = this.#nextHookId++;

    if (resolve) {
      const next = this.#chains.resolve[this.#chains.resolve.length - 1];
      this.#chains.resolve.push({ fn: resolve, url, next, hookId });
    }
    if (load) {
      const next = this.#chains.load[this.#chains.load.length - 1];
      this.#chains.load.push({ fn: load, url, next, hookId });
    }

    return {
      hookId,
      hasResolve: typeof resolve === 'function',
      hasLoad: typeof load === 'function',
      initialize: initialize?.(data),
    };
  }

  /**
   * Remove a previously registered hook module from the chains.
   * Not available in native Node.js -- this is a ponyfill extension.
   *
   * @param {number} hookId  The hook ID returned by register/addCustomLoader.
   * @returns {{ hasResolve: boolean, hasLoad: boolean }}
   */
  deregister(hookId) {
    removeFromChain(this.#chains.resolve, hookId);
    removeFromChain(this.#chains.load, hookId);
    return {
      hasResolve: this.#chains.resolve.length > 1,
      hasLoad: this.#chains.load.length > 1,
    };
  }

  /**
   * Run the resolve hook chain (LIFO).
   *
   * Mirrors AsyncLoaderHooksOnLoaderHookWorker#resolve in Node.js:
   * https://github.com/nodejs/node/blob/6b5178f7/lib/internal/modules/esm/hooks.js#L224-L355
   *
   * @param {string} specifier
   * @param {object} context
   * @returns {Promise<{ url: string, format?: string, importAttributes?: object }>}
   */
  async resolve(specifier, context) {
    const chain = this.#chains.resolve;
    const meta = { chainFinished: null, hookName: 'resolve' };

    const nextResolve = nextHookFactory(chain[chain.length - 1], meta);
    const result = await nextResolve(specifier, context);
    validateResolveResult(result);
    return result;
  }

  /**
   * Run the load hook chain (LIFO).
   *
   * Mirrors AsyncLoaderHooksOnLoaderHookWorker#load in Node.js:
   * https://github.com/nodejs/node/blob/6b5178f7/lib/internal/modules/esm/hooks.js#L357-L479
   *
   * @param {string} url
   * @param {object} context
   * @returns {Promise<{ format: string, source?: string | ArrayBuffer | TypedArray }>}
   */
  async load(url, context) {
    const chain = this.#chains.load;
    const meta = { chainFinished: null, hookName: 'load' };

    const nextLoad = nextHookFactory(chain[chain.length - 1], meta);
    const result = await nextLoad(url, context);
    validateLoadResult(result);
    return result;
  }
}

// ===========================================================================
// AsyncLoaderHookWorker (main-thread side)
// ===========================================================================

/**
 * Main-thread class that spawns the loader hook worker and communicates
 * with it via SharedArrayBuffer + Atomics. Pure transport layer.
 *
 * Mirrors Node.js's AsyncLoaderHookWorker:
 * https://github.com/nodejs/node/blob/6b5178f7/lib/internal/modules/esm/hooks.js#L493-L668
 *
 * Key differences from Node.js:
 * - Uses a user-land Worker + MessagePort instead of InternalWorker + syncCommPort.
 */
class AsyncLoaderHookWorker {
  /**
   * Shared memory. Always use Atomics methods to read or write to it.
   * Mirrors #lock in Node.js:
   * https://github.com/nodejs/node/blob/6b5178f7/lib/internal/modules/esm/hooks.js#L494-L498
   * @type {Int32Array}
   */
  #lock;

  /**
   * The Worker instance, which lets us communicate with the loader thread.
   * Mirrors #worker in Node.js:
   * https://github.com/nodejs/node/blob/6b5178f7/lib/internal/modules/esm/hooks.js#L499-L502
   * @type {Worker}
   */
  #worker;

  /**
   * MessagePort -- main thread side.
   * Node.js uses InternalWorker's built-in messaging; we use an explicit
   * MessageChannel since user-land Workers don't expose receiveMessageSync.
   * @type {MessagePort}
   */
  #port;

  /**
   * The last notification ID received from the worker. Used to detect if the
   * worker has already sent a notification before putting the main thread to
   * sleep, to avoid a race condition.
   * Mirrors #workerNotificationLastId in Node.js:
   * https://github.com/nodejs/node/blob/6b5178f7/lib/internal/modules/esm/hooks.js#L504-L510
   * @type {number}
   */
  #workerNotificationLastId = 0;

  /**
   * Whether the worker has signaled it is ready to receive messages.
   * Mirrors #isReady in Node.js:
   * https://github.com/nodejs/node/blob/6b5178f7/lib/internal/modules/esm/hooks.js#L518
   * @type {boolean}
   */
  #isReady = false;

  /**
   * Mirrors AsyncLoaderHookWorker constructor in Node.js:
   * https://github.com/nodejs/node/blob/6b5178f7/lib/internal/modules/esm/hooks.js#L520-L538
   */
  constructor() {
    const sharedBuffer = new SharedArrayBuffer(SHARED_MEMORY_BYTES);
    this.#lock = new Int32Array(sharedBuffer);

    const channel = new MessageChannel();
    this.#port = channel.port1;

    const workerURL = new URL('./worker.js', import.meta.url);
    this.#worker = new Worker(workerURL, {
      workerData: {
        lock: sharedBuffer,
        port: channel.port2,
      },
      transferList: [channel.port2],
      // Prevent inheriting --import/--require into the loader worker.
      // FIXME: filter them out instead of eliminating all execArgv?
      execArgv: [],
    });

    // Don't keep the process alive just for the hook worker.
    this.#worker.unref();
    this.#port.unref();

    // Handle worker errors.
    this.#worker.on('error', (err) => {
      // eslint-disable-next-line no-console
      console.error('[module-register-ponyfill] Worker error:', err);
    });

    this.#worker.on('exit', (code) => {
      if (code !== 0) {
        // eslint-disable-next-line no-console
        console.error(`[module-register-ponyfill] Worker exited with code ${code}`);
      }
      asyncLoaderHookWorker = null;
    });
  }

  /**
   * Block until the worker signals ready.
   *
   * Mirrors AsyncLoaderHookWorker#waitForWorker in Node.js:
   * https://github.com/nodejs/node/blob/6b5178f7/lib/internal/modules/esm/hooks.js#L540-L558
   */
  waitForWorker() {
    if (this.#isReady) return;

    const readyResult = Atomics.wait(this.#lock, WORKER_TO_MAIN, 0, WAIT_TIMEOUT_MS);
    if (readyResult === 'timed-out') {
      throw new Error(
        `Timed out waiting for hook worker to become ready after ${WAIT_TIMEOUT_MS}ms.`,
      );
    }
    this.#workerNotificationLastId = Atomics.load(this.#lock, WORKER_TO_MAIN);
    this.#isReady = true;
  }

  /**
   * Send a message to the worker and block until a response of the expected
   * type is received. Returns the unwrapped response body (msg.result).
   *
   * Mirrors AsyncLoaderHookWorker#makeSyncRequest + #unwrapMessage in Node.js:
   * https://github.com/nodejs/node/blob/6b5178f7/lib/internal/modules/esm/hooks.js#L622-L667
   *
   * @param {object} msg
   * @param {string} expectedResultType
   * @param {Transferable[]} [transferList]
   * @returns {object} The unwrapped response (msg.result).
   */
  makeSyncRequest(msg, expectedResultType, transferList) {
    this.waitForWorker();
    this.#sendToWorker(msg, transferList);
    while (true) {
      const response = this.#receiveWorkerMessage();
      if (!response) continue;
      if (response.type === expectedResultType) return response.result;
      // Unexpected type -- should not happen, but keep waiting.
    }
  }

  /**
   * Send a message to the worker.
   *
   * @param {object} msg
   * @param {Transferable[]} [transferList]
   */
  #sendToWorker(msg, transferList) {
    if (transferList && transferList.length > 0) {
      this.#port.postMessage(msg, transferList);
    } else {
      this.#port.postMessage(msg);
    }
  }

  /**
   * Block until the worker sends a notification, then receive and unwrap the
   * next message from the port. Throws on timeout, ERROR, or NEVER_SETTLE.
   * Returns null if no message was available after the atomic notification
   * (rare race) -- callers should retry.
   *
   * Mirrors the wait + #unwrapMessage pattern in Node.js:
   * https://github.com/nodejs/node/blob/6b5178f7/lib/internal/modules/esm/hooks.js#L633-L667
   *
   * @returns {object | null}
   */
  #receiveWorkerMessage() {
    const waitResult = Atomics.wait(
      this.#lock,
      WORKER_TO_MAIN,
      this.#workerNotificationLastId,
      WAIT_TIMEOUT_MS,
    );
    if (waitResult === 'timed-out') {
      throw new Error(
        'Timed out waiting for hook worker response ' +
          `after ${WAIT_TIMEOUT_MS}ms. ` +
          'The worker may have crashed or a hook may be hanging.',
      );
    }
    this.#workerNotificationLastId = Atomics.load(this.#lock, WORKER_TO_MAIN);

    const received = receiveMessageOnPort(this.#port);
    if (!received) return null;

    const msg = received.message;
    if (msg.type === MSG.ERROR) throw deserializeError(msg.error);
    if (msg.type === MSG.NEVER_SETTLE) {
      throw new Error(
        'Hook worker exited without settling the response. ' +
          'A hook may have returned a promise that never resolved.',
      );
    }
    return msg;
  }
}

// ===========================================================================
// pluckHooks
// ===========================================================================

/**
 * Extract { resolve, load, initialize } from a hook module's exports.
 *
 * Mirrors pluckHooks() in Node.js:
 * https://github.com/nodejs/node/blob/6b5178f7/lib/internal/modules/esm/hooks.js#L678-L724
 *
 * @param {object} exports
 * @returns {{ resolve?: Function, load?: Function, initialize?: Function }}
 */
function pluckHooks(exports) {
  const hooks = {};
  if (typeof exports.resolve === 'function') {
    hooks.resolve = exports.resolve;
  }
  if (typeof exports.load === 'function') {
    hooks.load = exports.load;
  }
  if (typeof exports.initialize === 'function') {
    hooks.initialize = exports.initialize;
  }
  return hooks;
}

// ===========================================================================
// nextHookFactory
// ===========================================================================

/**
 * Recursively build the next-hook function for a chain entry.
 * Walks the linked list via entry.next, producing a callable for each step.
 *
 * Mirrors nextHookFactory() in Node.js:
 * https://github.com/nodejs/node/blob/6b5178f7/lib/internal/modules/esm/hooks.js#L726-L786
 *
 * @param {{ fn: Function, url: string, next?: object }} current
 * @param {{ chainFinished: boolean | null, hookName: string }} meta
 * @returns {(arg0: any, context: object) => Promise<object>}
 */
function nextHookFactory(current, meta) {
  const { fn: hook, next } = current;

  let nextNextHook;
  if (next) {
    nextNextHook = nextHookFactory(next, meta);
  } else {
    nextNextHook = function chainAdvancedTooFar() {
      throw new Error(`Loader hook '${meta.hookName}' chain advanced beyond the end of the chain.`);
    };
  }

  return async function nextHook(arg0, context) {
    if (!next) {
      meta.chainFinished = true;
    }
    return hook(arg0, context, nextNextHook);
  };
}

// ===========================================================================
// getAsyncLoaderHookWorker (singleton)
// ===========================================================================

/**
 * Singleton instance, shared across all register() calls.
 * Mirrors getAsyncLoaderHookWorker() in Node.js:
 * https://github.com/nodejs/node/blob/6b5178f7/lib/internal/modules/esm/hooks.js#L787-L796
 * @type {AsyncLoaderHookWorker | null}
 */
let asyncLoaderHookWorker = null;

/**
 * Get or create the singleton AsyncLoaderHookWorker.
 * @returns {AsyncLoaderHookWorker}
 */
function getAsyncLoaderHookWorker() {
  asyncLoaderHookWorker ??= new AsyncLoaderHookWorker();
  return asyncLoaderHookWorker;
}

// ===========================================================================
// AsyncLoaderHooksProxiedToLoaderHookWorker (main-thread proxy)
// ===========================================================================

/**
 * Main-thread class that implements the AsyncLoaderHooks interface by
 * proxying all calls to the singleton AsyncLoaderHookWorker.
 *
 * Mirrors Node.js's AsyncLoaderHooksProxiedToLoaderHookWorker:
 * https://github.com/nodejs/node/blob/6b5178f7/lib/internal/modules/esm/hooks.js#L802-L866
 *
 * Key differences from Node.js:
 * - Includes deregister() (not available in native Node.js).
 */
export class AsyncLoaderHooksProxiedToLoaderHookWorker {
  /**
   * Mirrors AsyncLoaderHooksProxiedToLoaderHookWorker constructor in Node.js:
   * https://github.com/nodejs/node/blob/6b5178f7/lib/internal/modules/esm/hooks.js#L809-L811
   */
  constructor() {
    getAsyncLoaderHookWorker();
  }

  /**
   * Register a hook module on the worker.
   *
   * Mirrors AsyncLoaderHooksProxiedToLoaderHookWorker#register in Node.js:
   * https://github.com/nodejs/node/blob/6b5178f7/lib/internal/modules/esm/hooks.js#L825-L827
   *
   * @param {string} specifier
   * @param {string} parentURL
   * @param {any} [data]
   * @param {Transferable[]} [transferList]
   * @returns {{ hookId: number, hasResolve: boolean, hasLoad: boolean }}
   */
  register(specifier, parentURL, data, transferList) {
    return asyncLoaderHookWorker.makeSyncRequest(
      { type: MSG.REGISTER, specifier, parentURL, data },
      MSG.REGISTER_RESULT,
      transferList,
    );
  }

  /**
   * Synchronously resolve a module specifier via the worker's async hook
   * chain.
   *
   * Mirrors AsyncLoaderHooksProxiedToLoaderHookWorker#resolveSync in Node.js:
   * https://github.com/nodejs/node/blob/6b5178f7/lib/internal/modules/esm/hooks.js#L843-L845
   *
   * @param {string} specifier
   * @param {object} context
   * @returns {{ url: string, format?: string, importAttributes?: object }}
   */
  resolveSync(specifier, context) {
    const result = asyncLoaderHookWorker.makeSyncRequest(
      {
        type: MSG.RESOLVE_REQUEST,
        specifier,
        context: {
          parentURL: context.parentURL,
          conditions: context.conditions,
          importAttributes: context.importAttributes,
        },
      },
      MSG.RESOLVE_RESULT,
    );
    result.shortCircuit = true;
    return result;
  }

  /**
   * Synchronously load a module via the worker's async hook chain.
   *
   * Mirrors AsyncLoaderHooksProxiedToLoaderHookWorker#loadSync in Node.js:
   * https://github.com/nodejs/node/blob/6b5178f7/lib/internal/modules/esm/hooks.js#L857-L859
   *
   * @param {string} url
   * @param {object} context
   * @returns {{ format: string, source?: string | ArrayBuffer | TypedArray }}
   */
  loadSync(url, context) {
    const result = asyncLoaderHookWorker.makeSyncRequest(
      {
        type: MSG.LOAD_REQUEST,
        url,
        context: {
          format: context.format,
          conditions: context.conditions,
          importAttributes: context.importAttributes,
        },
      },
      MSG.LOAD_RESULT,
    );
    result.shortCircuit = true;
    return result;
  }

  /**
   * Deregister a previously registered hook module.
   * Not available in native Node.js -- this is a ponyfill extension.
   *
   * @param {number} hookId
   * @returns {{ hasResolve: boolean, hasLoad: boolean }}
   */
  deregister(hookId) {
    return asyncLoaderHookWorker.makeSyncRequest(
      { type: MSG.DEREGISTER, hookId },
      MSG.DEREGISTER_RESULT,
    );
  }

  /**
   * Block until the worker is ready.
   *
   * Mirrors waitForLoaderHookInitialization in Node.js:
   * https://github.com/nodejs/node/blob/6b5178f7/lib/internal/modules/esm/hooks.js#L861-L863
   */
  waitForLoaderHookInitialization() {
    asyncLoaderHookWorker.waitForWorker();
  }
}

// ===========================================================================
// Chain helpers (ponyfill-specific)
// ===========================================================================

/**
 * Remove an entry by hookId from a chain array and rebuild next pointers.
 *
 * @param {Array<{ fn: Function, url: string, next?: object, hookId?: number }>} chain
 * @param {number} hookId
 */
function removeFromChain(chain, hookId) {
  const idx = chain.findIndex((entry) => entry.hookId === hookId);
  if (idx === -1) return;
  chain.splice(idx, 1);
  // Rebuild next pointers after removal.
  for (let i = 1; i < chain.length; i++) {
    chain[i].next = chain[i - 1];
  }
}

// ===========================================================================
// Validation
// ===========================================================================

/**
 * @param {any} result
 */
function validateResolveResult(result) {
  if (!result || typeof result !== 'object') {
    throw new TypeError('resolve hook must return an object');
  }
  if (typeof result.url !== 'string') {
    throw new TypeError('resolve hook must return an object with a "url" string property');
  }
}

/**
 * @param {any} result
 */
function validateLoadResult(result) {
  if (!result || typeof result !== 'object') {
    throw new TypeError('load hook must return an object');
  }
  if (typeof result.format !== 'string') {
    throw new TypeError('load hook must return an object with a "format" string property');
  }
}
