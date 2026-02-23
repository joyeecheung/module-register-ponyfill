// Hook chain runner for the worker thread.
// Builds and executes LIFO async hook chains, with a "default" step
// that delegates back to the main thread via Atomics.

import { receiveMessageOnPort } from 'node:worker_threads';
import { MAIN_TO_WORKER, WORKER_TO_MAIN, MSG, WAIT_TIMEOUT_MS } from './constants.js';
import { serializeError } from './errors.js';

/**
 * Create a "default resolve" function that asks the main thread for the
 * default resolution result. This blocks the worker thread with Atomics.wait
 * until the main thread responds.
 *
 * @param {MessagePort} port  The port connected to the main thread.
 * @param {Int32Array} lock   The shared lock array.
 * @param {{ lastMainId: number }} state  Mutable state tracking the main thread notification counter.
 * @returns {(specifier: string, context: object) => object}
 */
export function createDefaultResolve(port, lock, state) {
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
 * @param {MessagePort} port
 * @param {Int32Array} lock
 * @param {{ lastMainId: number }} state
 * @returns {(url: string, context: object) => object}
 */
export function createDefaultLoad(port, lock, state) {
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
      throw new Error(
        `Timed out waiting for main thread response after ${WAIT_TIMEOUT_MS}ms.`
      );
    }
    state.lastMainId = Atomics.load(lock, MAIN_TO_WORKER);

    const received = receiveMessageOnPort(port);
    if (received) {
      const msg = received.message;
      if (msg.type === expectedType) {
        if (msg.error) {
          const err = new Error(msg.error.message);
          err.name = msg.error.name;
          if (msg.error.stack) err.stack = msg.error.stack;
          if (msg.error.code) /** @type {any} */ (err).code = msg.error.code;
          throw err;
        }
        return msg.result;
      }
      // Unexpected message type -- should not happen in normal flow.
      // Discard and keep waiting.
    }
  }
}

/**
 * Run the resolve hook chain (LIFO). Each hook gets an async nextResolve
 * that delegates to the previous hook, bottoming out at defaultResolve.
 *
 * @param {Array<{ resolve?: Function }>} hooks
 * @param {Function} defaultResolve
 * @param {string} specifier
 * @param {object} context
 * @returns {Promise<object>}
 */
export async function runResolveChain(hooks, defaultResolve, specifier, context) {
  // Collect only hooks that have a resolve function.
  const resolveHooks = [];
  for (const hook of hooks) {
    if (hook.resolve) {
      resolveHooks.push(hook.resolve);
    }
  }

  if (resolveHooks.length === 0) {
    return defaultResolve(specifier, context);
  }

  // Build the chain: last registered hook runs first (LIFO).
  // chain[0] = defaultResolve wrapper
  // chain[i+1] = resolveHooks[i] with next = chain[i]
  const chain = [
    async (spec, ctx) => defaultResolve(spec, ctx),
  ];

  for (let i = 0; i < resolveHooks.length; i++) {
    const hookFn = resolveHooks[i];
    const previous = chain[i];
    chain.push(async (spec, ctx) => {
      return hookFn(spec, ctx, previous);
    });
  }

  const runner = chain[chain.length - 1];
  const result = await runner(specifier, context);
  validateResolveResult(result);
  return result;
}

/**
 * Run the load hook chain (LIFO).
 *
 * @param {Array<{ load?: Function }>} hooks
 * @param {Function} defaultLoad
 * @param {string} url
 * @param {object} context
 * @returns {Promise<object>}
 */
export async function runLoadChain(hooks, defaultLoad, url, context) {
  const loadHooks = [];
  for (const hook of hooks) {
    if (hook.load) {
      loadHooks.push(hook.load);
    }
  }

  if (loadHooks.length === 0) {
    return defaultLoad(url, context);
  }

  const chain = [
    async (u, ctx) => defaultLoad(u, ctx),
  ];

  for (let i = 0; i < loadHooks.length; i++) {
    const hookFn = loadHooks[i];
    const previous = chain[i];
    chain.push(async (u, ctx) => {
      return hookFn(u, ctx, previous);
    });
  }

  const runner = chain[chain.length - 1];
  const result = await runner(url, context);
  validateLoadResult(result);
  return result;
}

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

/**
 * Extract { resolve, load, initialize } from a hook module's exports.
 * Mirrors Node.js's pluckHooks().
 *
 * @param {object} exports
 * @returns {{ resolve?: Function, load?: Function, initialize?: Function }}
 */
export function pluckHooks(exports) {
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
