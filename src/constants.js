// Shared constants between main thread and worker thread.

// Int32Array indices in the SharedArrayBuffer.
// Each is a monotonically increasing notification counter.
export const WORKER_TO_MAIN = 0;
export const MAIN_TO_WORKER = 1;

// Total bytes: 2 x Int32 = 8 bytes.
export const SHARED_MEMORY_BYTES = 2 * 4;

// Maximum milliseconds to block on Atomics.wait before assuming deadlock.
export const WAIT_TIMEOUT_MS = 30_000;

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

  // Worker -> Main: error occurred
  ERROR: 'error',
  // Worker -> Main: hook promise never settled
  NEVER_SETTLE: 'never-settle',
};
