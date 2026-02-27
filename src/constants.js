// Shared constants between main thread and worker thread.
//
// Reference: Node.js shared_constants.js
// https://github.com/nodejs/node/blob/6b5178f7/lib/internal/modules/esm/shared_constants.js

// Int32Array indices in the SharedArrayBuffer.
// Each is a monotonically increasing notification counter.
//
// In Node.js, only WORKER_TO_MAIN_THREAD_NOTIFICATION exists (index 0) with a
// single Int32. We add MAIN_TO_WORKER (index 1) for bidirectional blocking
// because our worker needs to block on main-thread default resolve/load.
// WORKER_EXIT_CODE (index 2) is set by the worker's process 'exit' handler
// so the main thread can detect process.exit() calls and propagate the code.
export const WORKER_TO_MAIN = 0;
export const MAIN_TO_WORKER = 1;
export const WORKER_EXIT_CODE = 2;

// Sentinel value stored in WORKER_EXIT_CODE when the worker has not exited.
// We use -1 because process.exit codes are non-negative integers.
export const EXIT_CODE_UNSET = -1;

// Total bytes: 3 x Int32 = 12 bytes.
// Node.js uses SHARED_MEMORY_BYTE_LENGTH = 1 * 4 (unidirectional).
export const SHARED_MEMORY_BYTES = 3 * 4;

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

  // Worker -> Main: hook chain needs the default resolve from main thread
  DEFAULT_RESOLVE_REQUEST: 'default-resolve-request',
  // Main -> Worker: default resolve result
  DEFAULT_RESOLVE_RESULT: 'default-resolve-result',

  // Worker -> Main: hook chain needs the default load from main thread
  DEFAULT_LOAD_REQUEST: 'default-load-request',
  // Main -> Worker: default load result
  DEFAULT_LOAD_RESULT: 'default-load-result',

  // Main -> Worker: deregister a previously registered hook module
  DEREGISTER: 'deregister',
  // Worker -> Main: deregistration complete
  DEREGISTER_RESULT: 'deregister-result',

  // Worker -> Main: error occurred
  ERROR: 'error',
  // Worker -> Main: hook promise never settled
  NEVER_SETTLE: 'never-settle',
};
