// Worker thread entry point.
// Loads hook modules, runs resolve/load chains, and communicates with the
// main thread via MessagePort + Atomics.

import { workerData, receiveMessageOnPort } from 'node:worker_threads';
import { WORKER_TO_MAIN, MAIN_TO_WORKER, MSG } from './constants.js';
import { serializeError } from './errors.js';
import {
  pluckHooks,
  createDefaultResolve,
  createDefaultLoad,
  runResolveChain,
  runLoadChain,
} from './hook-chain.js';

const { lock: lockBuffer, port } = workerData;
const lock = new Int32Array(lockBuffer);

// Mutable state: tracks the main thread's notification counter so we can
// detect new notifications via Atomics.wait.
const state = { lastMainId: 0 };

// Registered hook modules, in registration order.
// Chains run LIFO: last registered hook runs first.
const hooks = [];

// Default resolve/load that delegate back to the main thread.
const defaultResolve = createDefaultResolve(port, lock, state);
const defaultLoad = createDefaultLoad(port, lock, state);

/**
 * Notify the main thread that a message is ready.
 */
function notifyMain() {
  Atomics.add(lock, WORKER_TO_MAIN, 1);
  Atomics.notify(lock, WORKER_TO_MAIN);
}

/**
 * Send a success response to the main thread.
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
 * @param {object} msg
 */
async function handleMessage(msg) {
  try {
    switch (msg.type) {
      case MSG.REGISTER:
        await handleRegister(msg);
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
 * @param {{ specifier: string, parentURL: string, data?: any }} msg
 */
async function handleRegister(msg) {
  const resolvedURL = new URL(msg.specifier, msg.parentURL).href;
  const hookModule = await import(resolvedURL);
  const extracted = pluckHooks(hookModule);

  // Call initialize() with the data from the register() call.
  if (extracted.initialize) {
    await extracted.initialize(msg.data);
  }

  hooks.push(extracted);
  sendResult(MSG.REGISTER_RESULT, {
    hasResolve: typeof extracted.resolve === 'function',
    hasLoad: typeof extracted.load === 'function',
  });
}

/**
 * Run the resolve hook chain.
 * @param {{ specifier: string, context: object }} msg
 */
async function handleResolve(msg) {
  const result = await runResolveChain(hooks, defaultResolve, msg.specifier, msg.context);
  sendResult(MSG.RESOLVE_RESULT, result);
}

/**
 * Run the load hook chain.
 * @param {{ url: string, context: object }} msg
 */
async function handleLoad(msg) {
  const result = await runLoadChain(hooks, defaultLoad, msg.url, msg.context);

  // Transfer ArrayBuffer/TypedArray sources to avoid copying.
  const transferList = [];
  if (result && result.source) {
    if (result.source instanceof ArrayBuffer) {
      transferList.push(result.source);
    } else if (ArrayBuffer.isView(result.source) && result.source.buffer instanceof ArrayBuffer) {
      transferList.push(result.source.buffer);
    }
  }

  sendResult(MSG.LOAD_RESULT, result, transferList);
}

// --- Message polling loop ---
// Use dual-mode: event-based + setImmediate polling, mirroring Node.js internals.

let isProcessingMessage = false;

function checkForMessages() {
  if (isProcessingMessage) {
    setImmediate(checkForMessages);
    return;
  }
  const received = receiveMessageOnPort(port);
  if (received) {
    processMessage(received.message);
  }
  setImmediate(checkForMessages);
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
process.on('beforeExit', () => {
  port.postMessage({ type: MSG.NEVER_SETTLE });
  notifyMain();
});

// Start polling loop.
setImmediate(checkForMessages);

// Signal to the main thread that the worker is ready.
notifyMain();
