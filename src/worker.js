// Worker thread entry point.
// Loads hook modules, runs resolve/load chains, and communicates with the
// main thread via MessagePort + Atomics.
//
// Mirrors Node.js's worker.js (customizedModuleWorker + handleMessage):
// https://github.com/nodejs/node/blob/6b5178f7/lib/internal/modules/esm/worker.js
//
// Key differences:
// - We use a user-land Worker + MessagePort instead of InternalWorker + syncCommPort.
// - Hook chain management is delegated to AsyncLoaderHooksOnLoaderHookWorker
//   (in hooks.js), matching Node.js's architecture.
// - We support deregister (not available in native Node.js).
// - We capture Node.js's built-in defaultResolve/defaultLoad at startup via
//   registerHooks(), so the worker's hook chains can call nextResolve/nextLoad
//   without a round-trip to the main thread.

import assert from 'node:assert';
import { createRequire, registerHooks } from 'node:module';
import { receiveMessageOnPort, workerData } from 'node:worker_threads';
import { MSG, WORKER_TO_MAIN } from './constants.js';
import { serializeError } from './errors.js';
import { AsyncLoaderHooksOnLoaderHookWorker } from './hooks.js';

const { lock: lockBuffer, port } = workerData;
const lock = new Int32Array(lockBuffer);

// ---------------------------------------------------------------------------
// Capture Node.js's built-in ESM defaultResolve / defaultLoad
// ---------------------------------------------------------------------------
// We register a temporary pair of sync hooks whose sole purpose is to steal
// a reference to the `nextResolve` and `nextLoad` functions. These are the
// real Node.js built-in resolve and load steps. Once captured, we deregister
// the temporary hooks and use the captured functions as the default step at
// the bottom of the async hook chain.

let capturedDefaultResolve;
let capturedDefaultLoad;

// The exact data: URL imported by _trigger.js. We match on this so the
// temporary hooks only capture from the specific import we control.
const TRIGGER_URL = 'data:text/javascript,';

const tempHookHandle = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === TRIGGER_URL) {
      capturedDefaultResolve = nextResolve;
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url === TRIGGER_URL) {
      capturedDefaultLoad = nextLoad;
    }
    return nextLoad(url, context);
  },
});

// Require an ESM file that just statically imports TRIGGER_URL to hit the hooks via the
// ESM path. After this, capturedDefaultResolve and capturedDefaultLoad hold the ESM
// defaults.
createRequire(import.meta.url)('./_trigger.js');

// Remove the temporary hooks so they don't interfere with user hooks.
tempHookHandle.deregister();
assert.strictEqual(typeof capturedDefaultResolve, 'function');
assert.strictEqual(typeof capturedDefaultLoad, 'function');

// The loader instance that holds the hook chains and runs them.
// Mirrors the AsyncLoaderHooksOnLoaderHookWorker instance in Node.js's worker:
// https://github.com/nodejs/node/blob/6b5178f7/lib/internal/modules/esm/worker.js#L62
const loader = new AsyncLoaderHooksOnLoaderHookWorker(capturedDefaultResolve, capturedDefaultLoad);

/**
 * Notify the main thread that a message is ready.
 *
 * Mirrors the AtomicsAdd + AtomicsNotify pattern in Node.js's handleMessage:
 * https://github.com/nodejs/node/blob/6b5178f7/lib/internal/modules/esm/worker.js#L280-L281
 */
function notifyMain() {
  Atomics.add(lock, WORKER_TO_MAIN, 1);
  Atomics.notify(lock, WORKER_TO_MAIN);
}

/**
 * Send a success response to the main thread.
 *
 * Mirrors wrapMessage('success', response) + postMessage in Node.js:
 * https://github.com/nodejs/node/blob/6b5178f7/lib/internal/modules/esm/worker.js#L109-L141
 *
 * @param {string} type
 * @param {object} [result]
 * @param {Transferable[]} [transferList]
 */
function sendResult(type, result, transferList) {
  const msg = { type, result };
  if (transferList && transferList.length > 0) {
    port.postMessage(msg, transferList);
  } else {
    port.postMessage(msg);
  }
  notifyMain();
}

/**
 * Send an error response to the main thread.
 * @param {unknown} err
 */
function sendError(err) {
  port.postMessage({
    type: MSG.ERROR,
    error: serializeError(err),
  });
  notifyMain();
}

/**
 * Handle a message from the main thread.
 *
 * Mirrors handleMessage() in Node.js's worker.js:
 * https://github.com/nodejs/node/blob/6b5178f7/lib/internal/modules/esm/worker.js#L226-L282
 *
 * @param {object} msg
 */
async function handleMessage(msg) {
  try {
    switch (msg.type) {
      case MSG.REGISTER:
        await handleRegister(msg);
        break;
      case MSG.DEREGISTER:
        handleDeregister(msg);
        break;
      case MSG.RESOLVE_REQUEST:
        await handleResolve(msg);
        break;
      case MSG.LOAD_REQUEST:
        await handleLoad(msg);
        break;
      default:
        sendError(new Error(`Unknown message type: ${msg.type}`));
    }
  } catch (err) {
    sendError(err);
  }
}

/**
 * Register a new hook module.
 *
 * Delegates to AsyncLoaderHooksOnLoaderHookWorker#register, which mirrors
 * Node.js's register + addCustomLoader:
 * https://github.com/nodejs/node/blob/6b5178f7/lib/internal/modules/esm/hooks.js#L173-L213
 *
 * @param {{ specifier: string, parentURL: string, data?: any }} msg
 */
async function handleRegister(msg) {
  const result = await loader.register(msg.specifier, msg.parentURL, msg.data);
  sendResult(MSG.REGISTER_RESULT, result);
}

/**
 * Deregister a previously registered hook module.
 * @param {{ hookId: number }} msg
 */
function handleDeregister(msg) {
  const result = loader.deregister(msg.hookId);
  sendResult(MSG.DEREGISTER_RESULT, result);
}

/**
 * Run the resolve hook chain.
 * @param {{ specifier: string, context: object }} msg
 */
async function handleResolve(msg) {
  const result = await loader.resolve(msg.specifier, msg.context);
  sendResult(MSG.RESOLVE_RESULT, result);
}

/**
 * Run the load hook chain.
 * @param {{ url: string, context: object }} msg
 */
async function handleLoad(msg) {
  const result = await loader.load(msg.url, msg.context);

  // Normalize source: the ESM defaultLoad returns Buffers (which may use
  // pooled ArrayBuffers that can't be transferred). Convert them to strings.
  // User hooks that return ArrayBuffer/TypedArray are transferred directly.
  const transferList = [];
  if (result?.source) {
    if (Buffer.isBuffer(result.source)) {
      result.source = result.source.toString();
    } else if (result.source instanceof ArrayBuffer) {
      transferList.push(result.source);
    } else if (ArrayBuffer.isView(result.source) && result.source.buffer instanceof ArrayBuffer) {
      transferList.push(result.source.buffer);
    }
  }

  sendResult(MSG.LOAD_RESULT, result, transferList);
}

// --- Message polling loop ---
// Mirrors Node.js's checkForMessages pattern in the worker:
// https://github.com/nodejs/node/blob/6b5178f7/lib/internal/modules/esm/worker.js#L186-L195
//
// Every setImmediate is .unref()'d so the polling loop does not keep the
// worker's event loop alive on its own. The port's 'message' listener keeps
// the worker alive while the main-thread port is open; when the main process
// exits, the port closes and the worker can exit too.

let isProcessingMessage = false;

function checkForMessages() {
  if (isProcessingMessage) {
    setImmediate(checkForMessages).unref();
    return;
  }
  const received = receiveMessageOnPort(port);
  if (received) {
    processMessage(received.message);
  }
  setImmediate(checkForMessages).unref();
}

function processMessage(msg) {
  isProcessingMessage = true;
  handleMessage(msg).finally(() => {
    isProcessingMessage = false;
  });
}

// Event-based handler for when event loop is active.
port.on('message', (msg) => {
  if (!isProcessingMessage) {
    processMessage(msg);
  }
  // If already processing, the polling loop will pick it up.
});

// Handle beforeExit: notify main about unsettled hooks.
// Mirrors the unsettledResponsePorts + 'never-settle' pattern in Node.js:
// https://github.com/nodejs/node/blob/6b5178f7/lib/internal/modules/esm/worker.js#L197-L215
process.on('beforeExit', () => {
  port.postMessage({ type: MSG.NEVER_SETTLE });
  notifyMain();
});

// Start polling loop (unref'd -- does not keep event loop alive on its own).
setImmediate(checkForMessages).unref();

// Signal to the main thread that the worker is ready.
notifyMain();
