// Shared constants between main thread and worker thread.
//
// Reference: Node.js shared_constants.js
// https://github.com/nodejs/node/blob/6b5178f7/lib/internal/modules/esm/shared_constants.js

// Int32Array indices in the SharedArrayBuffer.
// Each is a monotonically increasing notification counter.
//
// Only WORKER_TO_MAIN is needed: the worker notifies the main thread when a
// request is complete. Communication is unidirectional (main blocks on worker),
// matching Node.js's upstream layout.
export const WORKER_TO_MAIN = 0;

// Total bytes: 1 x Int32 = 4 bytes.
// Matches Node.js's SHARED_MEMORY_BYTE_LENGTH.
export const SHARED_MEMORY_BYTES = 1 * 4;

// Maximum milliseconds to block on Atomics.wait before assuming deadlock.
// Configurable via the MODULE_REGISTER_TIMEOUT_MS environment variable.
const envTimeout = Number(process.env.MODULE_REGISTER_TIMEOUT_MS);
export const WAIT_TIMEOUT_MS = envTimeout > 0 ? envTimeout : 60_000;

// Message types exchanged over the MessagePort.
export const MSG = {
  // Main -> Worker: register a new hook module
  REGISTER: 'register',
  // Worker -> Main: registration complete
  REGISTER_RESULT: 'register-result',

  // Main -> Worker: run resolve hook chain
  RESOLVE_REQUEST: 'resolve-request',
  // Worker -> Main: resolve result
  RESOLVE_RESULT: 'resolve-result',

  // Main -> Worker: run load hook chain
  LOAD_REQUEST: 'load-request',
  // Worker -> Main: load result
  LOAD_RESULT: 'load-result',

  // Main -> Worker: deregister a previously registered hook module
  DEREGISTER: 'deregister',
  // Worker -> Main: deregistration complete
  DEREGISTER_RESULT: 'deregister-result',

  // Worker -> Main: error occurred
  ERROR: 'error',
  // Worker -> Main: hook promise never settled
  NEVER_SETTLE: 'never-settle',
};
