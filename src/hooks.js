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
import {
  MAIN_TO_WORKER,
  MSG,
  SHARED_MEMORY_BYTES,
  WAIT_TIMEOUT_MS,
  WORKER_TO_MAIN,
} from './constants.js';
import { deserializeError, serializeError } from './errors.js';

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
 * - Default resolve/load delegate back to the main thread via Atomics instead
 *   of calling Node.js internal resolve/load directly.
 * - Supports deregister() (not available in native Node.js).
 * - Omits shortCircuit/chainFinished tracking and deep validation since the
 *   main-thread registerHooks() layer handles those.
 */
export class AsyncLoaderHooksOnLoaderHookWorker {
  /**
   * LIFO hook chains. Each entry is a KeyedHook: { fn, url, next?, hookId? }.
   * Index 0 is always the default (main-thread delegate).
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
   * @param {MessagePort} port  Port connected to the main thread.
   * @param {Int32Array} lock   Shared lock array for Atomics.
   * @param {{ lastMainId: number }} state  Notification counter state.
   */
  constructor(port, lock, state) {
    this.#chains = {
      resolve: [
        {
          fn: createDefaultResolve(port, lock, state),
          url: 'ponyfill:default-resolve',
        },
      ],
      load: [
        {
          fn: createDefaultLoad(port, lock, state),
          url: 'ponyfill:default-load',
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
 * - Adds makeBidirectionalRequest() for bidirectional communication: when the
 *   worker's chain calls nextResolve/nextLoad to the default, the worker blocks
 *   while the main thread computes the default and sends the result back.
 *   In Node.js, the worker runs its own defaultResolve/defaultLoad directly.
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
   * Send a message to the worker and run the bidirectional wait loop.
   *
   * Unlike makeSyncRequest, this handles "default" requests from the worker
   * (where the worker's hook chain called nextResolve/nextLoad to the default).
   * This is unique to the ponyfill -- in Node.js, the worker runs its own
   * default resolve/load directly.
   *
   * @param {object} msg
   * @param {{ nextResolve?: Function, nextLoad?: Function }} defaultHandlers
   *   Main-thread callbacks for handling the worker's default resolve/load
   *   requests.
   * @param {string} expectedResultType
   * @returns {object} The unwrapped response (msg.result).
   */
  makeBidirectionalRequest(msg, defaultHandlers, expectedResultType) {
    this.waitForWorker();
    this.#sendToWorker(msg);
    return this.#runBidirectionalLoop(defaultHandlers, expectedResultType);
  }

  /**
   * Send a message to the worker and notify it.
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
    Atomics.add(this.#lock, MAIN_TO_WORKER, 1);
    Atomics.notify(this.#lock, MAIN_TO_WORKER);
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

  /**
   * Bidirectional wait loop: blocks main thread waiting for the worker,
   * but also handles "default" requests from the worker (where the worker's
   * hook chain called nextResolve/nextLoad all the way to the default).
   *
   * This is unique to the ponyfill. In Node.js, the worker runs the full hook
   * chain including the built-in defaultResolve/defaultLoad directly. Here,
   * the worker delegates "default" back to the main thread's nextResolve/
   * nextLoad from registerHooks(), which is the correct default step when
   * registerHooks() is in use.
   *
   * @param {{ nextResolve?: Function, nextLoad?: Function }} defaultHandlers
   * @param {string} expectedResultType
   * @returns {object}
   */
  #runBidirectionalLoop(defaultHandlers, expectedResultType) {
    const { nextResolve, nextLoad } = defaultHandlers;

    while (true) {
      const msg = this.#receiveWorkerMessage();
      if (!msg) continue;

      if (msg.type === expectedResultType) {
        // Final result from the worker's hook chain.
        const result = msg.result;
        result.shortCircuit = true;
        return result;
      }

      if (msg.type === MSG.DEFAULT_RESOLVE_REQUEST && nextResolve) {
        // Worker's chain called nextResolve() -- run main thread's default.
        try {
          const result = nextResolve(msg.specifier, msg.context);
          this.#sendToWorker({
            type: MSG.DEFAULT_RESOLVE_RESULT,
            result,
          });
        } catch (error) {
          this.#sendToWorker({
            type: MSG.DEFAULT_RESOLVE_RESULT,
            error: serializeError(error),
          });
        }
        continue;
      }

      if (msg.type === MSG.DEFAULT_LOAD_REQUEST && nextLoad) {
        // Worker's chain called nextLoad() -- run main thread's default.
        try {
          const result = nextLoad(msg.url, msg.context);
          this.#sendToWorker({
            type: MSG.DEFAULT_LOAD_RESULT,
            result,
          });
        } catch (error) {
          this.#sendToWorker({
            type: MSG.DEFAULT_LOAD_RESULT,
            error: serializeError(error),
          });
        }
      }

      // Unknown message -- ignore and keep waiting.
    }
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
 * - resolveSync() and loadSync() accept a nextResolve/nextLoad callback for
 *   bidirectional communication with the worker (see makeBidirectionalRequest).
 *   In Node.js, these are simple makeSyncRequest proxies since the worker has
 *   its own default resolve/load.
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
   * Key difference: accepts nextResolve for bidirectional communication.
   * In Node.js, this is a plain makeSyncRequest proxy since the worker has
   * its own defaultResolve. Here, the worker delegates the default back to
   * the main thread.
   *
   * @param {string} specifier
   * @param {object} context
   * @param {Function} nextResolve  Main thread's nextResolve from
   *   registerHooks().
   * @returns {{ url: string, format?: string, importAttributes?: object }}
   */
  resolveSync(specifier, context, nextResolve) {
    return asyncLoaderHookWorker.makeBidirectionalRequest(
      {
        type: MSG.RESOLVE_REQUEST,
        specifier,
        context: {
          parentURL: context.parentURL,
          conditions: context.conditions,
          importAttributes: context.importAttributes,
        },
      },
      { nextResolve },
      MSG.RESOLVE_RESULT,
    );
  }

  /**
   * Synchronously load a module via the worker's async hook chain.
   *
   * Mirrors AsyncLoaderHooksProxiedToLoaderHookWorker#loadSync in Node.js:
   * https://github.com/nodejs/node/blob/6b5178f7/lib/internal/modules/esm/hooks.js#L857-L859
   *
   * Key difference: accepts nextLoad for bidirectional communication.
   *
   * @param {string} url
   * @param {object} context
   * @param {Function} nextLoad  Main thread's nextLoad from registerHooks().
   * @returns {{ format: string, source?: string | ArrayBuffer | TypedArray }}
   */
  loadSync(url, context, nextLoad) {
    return asyncLoaderHookWorker.makeBidirectionalRequest(
      {
        type: MSG.LOAD_REQUEST,
        url,
        context: {
          format: context.format,
          conditions: context.conditions,
          importAttributes: context.importAttributes,
        },
      },
      { nextLoad },
      MSG.LOAD_RESULT,
    );
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
// Default resolve / load (ponyfill-specific, delegate to main thread)
// ===========================================================================

/**
 * Create a "default resolve" function that asks the main thread for the
 * default resolution result. This blocks the worker with Atomics.wait
 * until the main thread responds.
 *
 * In Node.js, the worker runs defaultResolve from internal/modules/esm/resolve
 * directly. Here, we delegate back to the main thread so the registerHooks()
 * chain's nextResolve provides the correct default.
 *
 * @param {MessagePort} port
 * @param {Int32Array} lock
 * @param {{ lastMainId: number }} state
 * @returns {(specifier: string, context: object) => object}
 */
function createDefaultResolve(port, lock, state) {
  return function defaultResolve(specifier, context) {
    // Ask the main thread to run its nextResolve.
    port.postMessage({
      type: MSG.DEFAULT_RESOLVE_REQUEST,
      specifier,
      context,
    });
    Atomics.add(lock, WORKER_TO_MAIN, 1);
    Atomics.notify(lock, WORKER_TO_MAIN);

    // Block until main thread responds.
    return waitForMainResponse(port, lock, state, MSG.DEFAULT_RESOLVE_RESULT);
  };
}

/**
 * Create a "default load" function that asks the main thread for the
 * default load result.
 *
 * Same rationale as createDefaultResolve -- delegates to main thread
 * instead of running Node.js's defaultLoad locally.
 *
 * @param {MessagePort} port
 * @param {Int32Array} lock
 * @param {{ lastMainId: number }} state
 * @returns {(url: string, context: object) => object}
 */
function createDefaultLoad(port, lock, state) {
  return function defaultLoad(url, context) {
    port.postMessage({
      type: MSG.DEFAULT_LOAD_REQUEST,
      url,
      context,
    });
    Atomics.add(lock, WORKER_TO_MAIN, 1);
    Atomics.notify(lock, WORKER_TO_MAIN);

    return waitForMainResponse(port, lock, state, MSG.DEFAULT_LOAD_RESULT);
  };
}

/**
 * Block the worker thread until a specific message type arrives from main.
 *
 * @param {MessagePort} port
 * @param {Int32Array} lock
 * @param {{ lastMainId: number }} state
 * @param {string} expectedType
 * @returns {object}
 */
function waitForMainResponse(port, lock, state, expectedType) {
  while (true) {
    const waitResult = Atomics.wait(lock, MAIN_TO_WORKER, state.lastMainId, WAIT_TIMEOUT_MS);
    if (waitResult === 'timed-out') {
      throw new Error(`Timed out waiting for main thread response after ${WAIT_TIMEOUT_MS}ms.`);
    }
    state.lastMainId = Atomics.load(lock, MAIN_TO_WORKER);

    const received = receiveMessageOnPort(port);
    if (received) {
      const msg = received.message;
      if (msg.type === expectedType) {
        if (msg.error) throw deserializeError(msg.error);
        return msg.result;
      }
      // Unexpected message type -- should not happen in normal flow.
      // Discard and keep waiting.
    }
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
