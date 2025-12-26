/**
 * Worker thread that loads and runs the hook module.
 *
 * This worker:
 * 1. Loads the hook module specified in workerData
 * 2. Calls initialize() if present
 * 3. Listens for hook calls from the main thread
 * 4. Executes resolve/load hooks and returns results via MessagePort + Atomics
 */

import { workerData, parentPort } from 'node:worker_threads';

const { hookModuleURL, syncPort, sharedBuffer, initializeData } = workerData;

const sharedArray = new Int32Array(sharedBuffer);

let resolveHook = null;
let loadHook = null;

// Create a mock nextResolve/nextLoad for the hooks
// In the userland version, we signal back that the hook wants to defer
function createNextResolve(originalArgs) {
  return async (specifier, context) => {
    // Return a signal that the hook is deferring to the next hook
    return {
      url: specifier?.startsWith?.('file://') ? specifier : originalArgs.specifier,
      format: context?.format,
      importAttributes: context?.importAttributes,
      _deferred: true,
    };
  };
}

function createNextLoad(originalArgs) {
  return async (url, context) => {
    // Return a signal that the hook is deferring to the next hook
    return {
      format: context?.format,
      source: undefined,
      _deferred: true,
    };
  };
}

async function initialize() {
  try {
    // Load the hook module
    const hookModule = await import(hookModuleURL);

    // Call initialize if present
    if (typeof hookModule.initialize === 'function') {
      await hookModule.initialize(initializeData);
    }

    // Store hooks
    if (typeof hookModule.resolve === 'function') {
      resolveHook = hookModule.resolve;
    }
    if (typeof hookModule.load === 'function') {
      loadHook = hookModule.load;
    }

    // Signal ready
    parentPort.postMessage({
      type: 'ready',
      hasResolve: !!resolveHook,
      hasLoad: !!loadHook,
    });
  } catch (err) {
    parentPort.postMessage({
      type: 'error',
      error: { message: err.message, code: err.code },
    });
    process.exit(1);
  }
}

// Handle hook calls from main thread
if (typeof syncPort?.unref === 'function') {
  syncPort.unref();
}
parentPort.on('message', async (msg) => {
  if (msg.type === 'call') {
    const { hookName, args } = msg;
    
    try {
      let result;

      if (hookName === 'resolve' && resolveHook) {
        const nextResolve = createNextResolve(args);
        result = await resolveHook(args.specifier, args.context, nextResolve);
        // If the hook called nextResolve and got a deferred result, signal that
        if (result?._deferred) {
          result = null; // No custom handling, defer to built-in
        }
      } else if (hookName === 'load' && loadHook) {
        const nextLoad = createNextLoad(args);
        result = await loadHook(args.url, args.context, nextLoad);
        // If the hook called nextLoad and got a deferred result, signal that
        if (result?._deferred) {
          result = null; // No custom handling, defer to built-in
        }
      }

      // Send response via sync port and signal via shared buffer
      syncPort.postMessage({ result });
      Atomics.store(sharedArray, 0, 1);
      Atomics.notify(sharedArray, 0);
    } catch (err) {
      // Send error response
      syncPort.postMessage({
        error: { message: err.message, code: err.code },
      });
      Atomics.store(sharedArray, 0, 1);
      Atomics.notify(sharedArray, 0);
    }
  }
});

// Start initialization
initialize();
