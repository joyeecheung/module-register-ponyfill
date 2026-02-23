// Main-thread entry point.
// Exports a drop-in replacement for module.register() that uses
// module.registerHooks() + a worker thread + Atomics.

import { registerHooks } from 'node:module';
import { MessageChannel, receiveMessageOnPort, Worker } from 'node:worker_threads';
import {
  MAIN_TO_WORKER,
  MSG,
  SHARED_MEMORY_BYTES,
  WAIT_TIMEOUT_MS,
  WORKER_TO_MAIN,
} from './constants.js';
import { deserializeError, serializeError } from './errors.js';

// Singleton state -- shared across all register() calls.
let lock = null; // Int32Array over SharedArrayBuffer
let port1 = null; // MessagePort -- main thread side
let worker = null; // Worker instance
let initialized = false;
let hooksRegistered = false;
let lastWorkerId = 0; // Tracks worker's notification counter

// Whether any hooks with resolve/load have been registered.
let hasResolveHooks = false;
let hasLoadHooks = false;

/**
 * Wait for a response from the worker thread (blocking).
 * Returns the message, or throws if an error or never-settle is received.
 *
 * @param {string} [expectedType] If specified, only return when this type is received.
 * @returns {object} The message from the worker.
 */
function waitForWorkerResponse(expectedType) {
  while (true) {
    const waitResult = Atomics.wait(lock, WORKER_TO_MAIN, lastWorkerId, WAIT_TIMEOUT_MS);
    if (waitResult === 'timed-out') {
      throw new Error(
        `Timed out waiting for hook worker response after ${WAIT_TIMEOUT_MS}ms. ` +
          'The worker may have crashed or a hook may be hanging.',
      );
    }
    lastWorkerId = Atomics.load(lock, WORKER_TO_MAIN);

    const received = receiveMessageOnPort(port1);
    if (!received) continue;

    const msg = received.message;

    if (msg.type === MSG.ERROR) {
      throw deserializeError(msg.error);
    }
    if (msg.type === MSG.NEVER_SETTLE) {
      throw new Error(
        'Hook worker exited without settling the response. ' +
          'A hook may have returned a promise that never resolved.',
      );
    }

    if (!expectedType || msg.type === expectedType) {
      return msg;
    }
    // Unexpected type -- should not happen, but keep waiting.
  }
}

/**
 * Send a message to the worker and notify it.
 *
 * @param {object} msg
 * @param {Transferable[]} [transferList]
 */
function sendToWorker(msg, transferList) {
  if (transferList && transferList.length > 0) {
    port1.postMessage(msg, transferList);
  } else {
    port1.postMessage(msg);
  }
  Atomics.add(lock, MAIN_TO_WORKER, 1);
  Atomics.notify(lock, MAIN_TO_WORKER);
}

/**
 * Initialize the worker thread singleton.
 */
function ensureWorker() {
  if (initialized) return;
  initialized = true;

  const sharedBuffer = new SharedArrayBuffer(SHARED_MEMORY_BYTES);
  lock = new Int32Array(sharedBuffer);

  const channel = new MessageChannel();
  port1 = channel.port1;

  const workerURL = new URL('./worker-entry.js', import.meta.url);
  worker = new Worker(workerURL, {
    workerData: {
      lock: sharedBuffer,
      port: channel.port2,
    },
    transferList: [channel.port2],
  });

  // Don't keep the process alive just for the hook worker.
  worker.unref();

  // Handle worker errors.
  worker.on('error', (err) => {
    // eslint-disable-next-line no-console
    console.error('[module-register-ponyfill] Worker error:', err);
  });

  worker.on('exit', (code) => {
    if (code !== 0) {
      // eslint-disable-next-line no-console
      console.error(`[module-register-ponyfill] Worker exited with code ${code}`);
    }
    initialized = false;
    worker = null;
  });

  // Block until the worker signals ready.
  const readyResult = Atomics.wait(lock, WORKER_TO_MAIN, 0, WAIT_TIMEOUT_MS);
  if (readyResult === 'timed-out') {
    throw new Error(
      `Timed out waiting for hook worker to become ready after ${WAIT_TIMEOUT_MS}ms.`,
    );
  }
  lastWorkerId = Atomics.load(lock, WORKER_TO_MAIN);
}

/**
 * Register the single pair of sync hooks (only once).
 */
function ensureHooksRegistered() {
  if (hooksRegistered) return;
  hooksRegistered = true;

  registerHooks({
    resolve: proxyResolve,
    load: proxyLoad,
  });
}

/**
 * Sync resolve hook that proxies to the worker's async hook chain.
 * Uses bidirectional communication: if the worker's chain calls nextResolve(),
 * we receive a DEFAULT_RESOLVE_REQUEST and call our own nextResolve.
 *
 * @param {string} specifier
 * @param {object} context
 * @param {Function} nextResolve
 * @returns {object}
 */
function proxyResolve(specifier, context, nextResolve) {
  if (!hasResolveHooks) {
    // No async resolve hooks registered -- skip worker round-trip.
    return nextResolve(specifier, context);
  }

  sendToWorker({
    type: MSG.RESOLVE_REQUEST,
    specifier,
    context: {
      parentURL: context.parentURL,
      conditions: context.conditions,
      importAttributes: context.importAttributes,
    },
  });

  return runBidirectionalLoop(nextResolve, null, MSG.RESOLVE_RESULT);
}

/**
 * Sync load hook that proxies to the worker's async hook chain.
 *
 * @param {string} url
 * @param {object} context
 * @param {Function} nextLoad
 * @returns {object}
 */
function proxyLoad(url, context, nextLoad) {
  if (!hasLoadHooks) {
    // No async load hooks registered -- skip worker round-trip.
    return nextLoad(url, context);
  }

  sendToWorker({
    type: MSG.LOAD_REQUEST,
    url,
    context: {
      format: context.format,
      conditions: context.conditions,
      importAttributes: context.importAttributes,
    },
  });

  return runBidirectionalLoop(null, nextLoad, MSG.LOAD_RESULT);
}

/**
 * Bidirectional wait loop: blocks main thread waiting for the worker,
 * but also handles "default" requests from the worker (where the worker's
 * hook chain called nextResolve/nextLoad all the way to the default).
 *
 * @param {Function|null} nextResolve  Main thread's nextResolve (for DEFAULT_RESOLVE_REQUEST)
 * @param {Function|null} nextLoad     Main thread's nextLoad (for DEFAULT_LOAD_REQUEST)
 * @param {string} expectedResultType  The final result message type to return on.
 * @returns {object}
 */
function runBidirectionalLoop(nextResolve, nextLoad, expectedResultType) {
  while (true) {
    const waitResult = Atomics.wait(lock, WORKER_TO_MAIN, lastWorkerId, WAIT_TIMEOUT_MS);
    if (waitResult === 'timed-out') {
      throw new Error(
        `Timed out waiting for hook worker response after ${WAIT_TIMEOUT_MS}ms. ` +
          'The worker may have crashed or a hook may be hanging.',
      );
    }
    lastWorkerId = Atomics.load(lock, WORKER_TO_MAIN);

    const received = receiveMessageOnPort(port1);
    if (!received) continue;

    const msg = received.message;

    if (msg.type === MSG.ERROR) {
      throw deserializeError(msg.error);
    }

    if (msg.type === MSG.NEVER_SETTLE) {
      throw new Error(
        'Hook worker exited without settling the response. ' +
          'A hook may have returned a promise that never resolved.',
      );
    }

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
        sendToWorker({
          type: MSG.DEFAULT_RESOLVE_RESULT,
          result,
        });
      } catch (error) {
        sendToWorker({
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
        sendToWorker({
          type: MSG.DEFAULT_LOAD_RESULT,
          result,
        });
      } catch (error) {
        sendToWorker({
          type: MSG.DEFAULT_LOAD_RESULT,
          error: serializeError(error),
        });
      }
    }

    // Unknown message -- ignore and keep waiting.
  }
}

/**
 * Register a module that exports hooks to customize Node.js module resolution
 * and loading. Drop-in replacement for `module.register()`.
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
  // Normalize arguments -- mirror Node.js's argument normalization.
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

  // Initialize the worker if needed.
  ensureWorker();

  // Send the register request to the worker.
  const msg = {
    type: MSG.REGISTER,
    specifier,
    parentURL,
    data,
  };

  // The user's transferList may contain MessagePorts etc.
  // These go into the postMessage transferList (not the message body).
  if (transferList && transferList.length > 0) {
    port1.postMessage(msg, transferList);
  } else {
    port1.postMessage(msg);
  }
  Atomics.add(lock, MAIN_TO_WORKER, 1);
  Atomics.notify(lock, MAIN_TO_WORKER);

  // Block until registration is confirmed.
  const response = waitForWorkerResponse(MSG.REGISTER_RESULT);

  // Track what kind of hooks were registered so the proxies know
  // whether to delegate to the worker or short-circuit.
  if (response.result?.hasResolve) {
    hasResolveHooks = true;
  }
  if (response.result?.hasLoad) {
    hasLoadHooks = true;
  }
  // If the response doesn't have hook info (e.g. older protocol), assume both.
  if (!response.result) {
    hasResolveHooks = true;
    hasLoadHooks = true;
  }

  // Register the sync hooks once we know there are async hooks.
  ensureHooksRegistered();

  // Return a handle that can deregister this hook -- a nice-to-have that
  // the native module.register() does not offer.
  const hookId = response.result ? response.result.hookId : -1;
  return {
    deregister() {
      sendToWorker({ type: MSG.DEREGISTER, hookId });
      const deregResponse = waitForWorkerResponse(MSG.DEREGISTER_RESULT);
      if (deregResponse.result) {
        hasResolveHooks = deregResponse.result.hasResolve;
        hasLoadHooks = deregResponse.result.hasLoad;
      }
    },
  };
}

/**
 * Check if a value is a URL instance.
 * @param {any} value
 * @returns {boolean}
 */
function isURL(value) {
  return value instanceof URL;
}
