/**
 * Userland polyfill for module.register() using module.registerHooks() + Worker threads.
 *
 * Unlike the real module.register():
 * - Previously registered hooks do NOT affect the resolution/loading of hook modules
 *   registered later (hook modules are loaded in the worker which don't in turn register
 *   the hooks; hooks are on the main thread).
 *
 * Usage:
 *   import { register } from 'userland-register';
 *   register('./my-hooks.js', import.meta.url, { data: { port }, transferList: [port] });
 */

import { registerHooks } from 'node:module';
import {
  Worker,
  MessageChannel,
  receiveMessageOnPort,
} from 'node:worker_threads';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

// We maintain a chain of workers, each representing a registered hook module.
// When resolve/load is called, we go through the chain in LIFO order.
const hookWorkers = [];

/**
 * Register a hook module, similar to module.register().
 *
 * @param {string|URL} specifier - The hook module specifier
 * @param {string|URL} [parentURL] - The parent URL for resolution
 * @param {Object} [options] - Options
 * @param {any} [options.data] - Data to pass to initialize()
 * @param {Object[]} [options.transferList] - Transferable objects
 */
export function register(specifier, parentURL, options) {
  // Handle overloaded signatures like the real module.register()
  if (typeof parentURL === 'object' && parentURL !== null && !(parentURL instanceof URL)) {
    options = parentURL;
    parentURL = options.parentURL;
  }

  // Resolve the specifier to an absolute URL
  let resolvedURL;
  if (specifier instanceof URL) {
    resolvedURL = specifier.href;
  } else if (specifier.startsWith('file://') || specifier.startsWith('data:')) {
    resolvedURL = specifier;
  } else if (specifier.startsWith('./') || specifier.startsWith('../') || specifier.startsWith('/')) {
    // Relative or absolute path
    const base = parentURL
      ? (typeof parentURL === 'string' ? parentURL : parentURL.href)
      : pathToFileURL(process.cwd() + '/').href;
    resolvedURL = new URL(specifier, base).href;
  } else {
    // Bare specifier - resolve from parent
    const base = parentURL
      ? (typeof parentURL === 'string' ? parentURL : parentURL.href)
      : pathToFileURL(process.cwd() + '/').href;
    resolvedURL = new URL(specifier, base).href;
  }

  const { data, transferList = [] } = options || {};

  // Create message channel for synchronous communication using receiveMessageOnPort
  const syncChannel = new MessageChannel();
  // SharedArrayBuffer for signaling (worker sets flag when response is ready)
  const sharedBuffer = new SharedArrayBuffer(4);
  const sharedArray = new Int32Array(sharedBuffer);

  // Create the worker
  const worker = new Worker(path.join(import.meta.dirname, 'worker.js'), {
    workerData: {
      hookModuleURL: resolvedURL,
      syncPort: syncChannel.port2,
      sharedBuffer,
      initializeData: data,
    },
    transferList: [syncChannel.port2, ...transferList],
  });

  // Wait for worker to be ready (it will load the hook module and call initialize)
  const readyPromise = new Promise((resolve, reject) => {
    const onMessage = (msg) => {
      if (msg.type === 'ready') {
        worker.off('message', onMessage);
        worker.off('error', onError);
        worker.off('exit', onExit);
        resolve(msg);
      } else if (msg.type === 'error') {
        worker.off('message', onMessage);
        worker.off('error', onError);
        worker.off('exit', onExit);
        reject(new Error(msg.error.message));
      }
    };
    const onError = (err) => {
      worker.off('message', onMessage);
      worker.off('error', onError);
      worker.off('exit', onExit);
      reject(err);
    };
    const onExit = (code) => {
      worker.off('message', onMessage);
      worker.off('error', onError);
      worker.off('exit', onExit);
      reject(new Error(`Worker exited with code ${code} before becoming ready`));
    };
    worker.on('message', onMessage);
    worker.on('error', onError);
    worker.on('exit', onExit);
  });

  // Store worker info
  const workerInfo = {
    worker,
    syncPort: syncChannel.port1,
    sharedArray,
    readyPromise,
    hasResolve: false,
    hasLoad: false,
  };

  // Unref the port so it doesn't keep the process alive
  // Note: We don't unref the worker until after it's ready
  syncChannel.port1.unref();

  hookWorkers.push(workerInfo);
}

/**
 * Synchronously call a hook on a worker and get the result.
 * Uses Atomics.wait + receiveMessageOnPort for synchronous communication.
 */
function callWorkerSync(workerInfo, hookName, args) {
  const { worker, syncPort, sharedArray } = workerInfo;

  // Reset the shared flag
  Atomics.store(sharedArray, 0, 0);

  // Send request to worker via main channel
  worker.postMessage({ type: 'call', hookName, args });

  // Busy-wait for response using Atomics
  const startTime = Date.now();
  const timeout = 30000; // 30 seconds

  while (Atomics.load(sharedArray, 0) === 0) {
    // Check for timeout
    if (Date.now() - startTime > timeout) {
      throw new Error(`Hook ${hookName} timed out after ${timeout}ms`);
    }
    // We need to yield to allow the worker's message to arrive
    // This is a busy-wait but necessary for synchronous blocking on main thread
  }

  // Read response from the sync port
  const msg = receiveMessageOnPort(syncPort);
  if (!msg) {
    throw new Error(`No response received for hook ${hookName}`);
  }

  const response = msg.message;
  if (response.error) {
    const err = new Error(response.error.message);
    err.code = response.error.code;
    throw err;
  }

  return response.result;
}

// Install the synchronous hooks that delegate to workers
let hooksInstalled = false;

function ensureHooksInstalled() {
  if (hooksInstalled) return;
  hooksInstalled = true;

  registerHooks({
    resolve(specifier, context, nextResolve) {
      // Go through workers in LIFO order
      let currentResult = null;

      for (let i = hookWorkers.length - 1; i >= 0; i--) {
        const workerInfo = hookWorkers[i];

        if (!workerInfo.hasResolve) continue;

        try {
          const args = {
            specifier,
            context: {
              conditions: context.conditions,
              importAttributes: context.importAttributes,
              parentURL: context.parentURL,
            },
          };

          const result = callWorkerSync(workerInfo, 'resolve', args);

          if (result) {
            if (result.shortCircuit) {
              return result;
            }
            // Update for next iteration
            specifier = result.url || specifier;
            currentResult = result;
          }
        } catch (err) {
          // If worker hook fails, continue to next
          console.error('Worker resolve hook error:', err);
        }
      }

      // Call the next (default) resolve
      if (currentResult && currentResult.url) {
        return nextResolve(currentResult.url, {
          ...context,
          importAttributes: currentResult.importAttributes || context.importAttributes,
        });
      }

      return nextResolve(specifier, context);
    },

    load(url, context, nextLoad) {
      // Go through workers in LIFO order
      for (let i = hookWorkers.length - 1; i >= 0; i--) {
        const workerInfo = hookWorkers[i];

        if (!workerInfo.hasLoad) continue;

        try {
          const args = {
            url,
            context: {
              conditions: context.conditions,
              format: context.format,
              importAttributes: context.importAttributes,
            },
          };

          const result = callWorkerSync(workerInfo, 'load', args);

          if (result) {
            if (result.shortCircuit) {
              return result;
            }
            if (result.source !== undefined) {
              return {
                format: result.format,
                source: result.source,
                shortCircuit: true,
              };
            }
          }
        } catch (err) {
          // If worker hook fails, continue to next
          console.error('Worker load hook error:', err);
        }
      }

      return nextLoad(url, context);
    },
  });
}

// Export a helper to wait for all workers to be ready
export async function waitForReady() {
  await Promise.all(hookWorkers.map(async (info) => {
    const result = await info.readyPromise;
    info.hasResolve = result.hasResolve;
    info.hasLoad = result.hasLoad;
    // Now that the worker is ready, unref it so it doesn't keep the process alive
    info.worker.unref();
  }));
  ensureHooksInstalled();
}

// For synchronous usage patterns
export function registerSync(specifier, parentURL, options) {
  register(specifier, parentURL, options);
  // Note: In real usage, you'd need to ensure worker is ready
  // before any module loading happens
}
