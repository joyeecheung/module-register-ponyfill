# Node.js core test coverage

This document tracks the 48 `test-async-loader-hooks-*` tests from Node.js
(commit `6b5178f7`) at `reference/node/test/module-hooks/` and their status
relative to this ponyfill.

## Ported tests (8)

| Node.js test file | Ponyfill test | What it covers |
| --- | --- | --- |
| `register-with-import` | `node-resolve-passthru` | Passthru resolve hook via `register()` |
| `initialize-invoke` | `node-initialize-invoke` | `initialize()` is called on `register()` |
| `initialize-in-sequence` | `node-initialize-sequence` | Multiple `register()` calls invoke `initialize()` in order |
| `register-with-ports` | `node-register-with-ports` | `MessagePort` transfer via `transferList` |
| `register-with-url-parenturl` | `node-url-parenturl` | `URL` object accepted as `parentURL` |
| `initialize-rejecting` | `node-initialize-rejecting` | Rejected promise in `initialize()` propagates |
| `initialize-throw-null` | `node-initialize-throw-null` | Throwing `null` in `initialize()` propagates |
| `throw-error` | `node-throw-error` | `Error` thrown from hook module top-level propagates |
| `register-with-cjs` | `node-register-with-cjs` | `register()` works from CJS entry point |
| `register-with-require` | `node-register-with-require` | `register()` works via `--require` CJS preload |

## Unsupported tests (38)

### `--experimental-loader` only (13)

These tests exercise the deprecated `--experimental-loader` CLI flag, not the
`module.register()` API. The ponyfill only implements `register()`.

| Test file | Reason |
| --- | --- |
| `called-with-expected-args` | Tests resolve/load arguments passed via `--experimental-loader` |
| `called-with-register` | Combines `--experimental-loader` (no-op) with `register()` |
| `mixed-opt-in` | Tests `--experimental-loader` with mixed CJS/ESM module types |
| `throw-bigint` | `--experimental-loader` error display for thrown BigInt |
| `throw-boolean` | `--experimental-loader` error display for thrown boolean |
| `throw-empty-object` | `--experimental-loader` error display for thrown empty object |
| `throw-function` | `--experimental-loader` error display for thrown function |
| `throw-null` | `--experimental-loader` error display for thrown null |
| `throw-number` | `--experimental-loader` error display for thrown number |
| `throw-object` | `--experimental-loader` error display for thrown object |
| `throw-string` | `--experimental-loader` error display for thrown string |
| `throw-symbol` | `--experimental-loader` error display for thrown symbol |
| `throw-undefined` | `--experimental-loader` error display for thrown undefined |

### Never-settling hooks (10)

Node.js detects never-settling hook promises and exits with code 13 +
`ERR_ASYNC_LOADER_REQUEST_NEVER_SETTLED`. The ponyfill uses `Atomics.wait`
with a configurable timeout (`WAIT_TIMEOUT_MS`) instead, which throws after
60 seconds by default. The error mechanism is fundamentally different.

| Test file | Reason |
| --- | --- |
| `initialize-never-settling` | `initialize()` returns never-settling promise |
| `never-settling-import-meta-resolve` | `import.meta.resolve` with never-settling hook |
| `never-settling-load-cjs` | CJS load with never-settling hook |
| `never-settling-load-esm-no-warning` | ESM load with never-settling hook (no warning test) |
| `never-settling-load-esm-with-warning` | ESM load with never-settling hook (warning test) |
| `never-settling-race-cjs` | CJS race with never-settling hook |
| `never-settling-race-esm` | ESM race with never-settling hook |
| `never-settling-resolve-cjs` | CJS resolve with never-settling hook |
| `never-settling-resolve-esm-no-warning` | ESM resolve with never-settling hook (no warning test) |
| `never-settling-resolve-esm-with-warning` | ESM resolve with never-settling hook (warning test) |

### `process.exit` from hooks (4)

These tests verify Node.js's behavior when `process.exit()` is called from
within a hook or `initialize()`. Worker thread exit semantics differ between
native `module.register()` (which runs hooks on the main thread's off-thread
loader) and the ponyfill (which uses a standard `worker_threads` Worker).

| Test file | Reason |
| --- | --- |
| `initialize-process-exit` | `process.exit()` in `initialize()` |
| `process-exit-async` | `process.exit()` in async hook |
| `process-exit-sync` | `process.exit()` in sync part of hook |
| `process-exit-top-level` | `process.exit()` at hook module top level |

### Permission model (3)

These tests exercise Node.js's `--permission` flag to restrict worker thread
creation. This is a Node.js-internal security feature not relevant to the
ponyfill API surface.

| Test file | Reason |
| --- | --- |
| `without-worker-permission` | `register()` fails without worker permission |
| `with-worker-permission-allowed` | `register()` works with worker permission granted |
| `with-worker-permission-restricted` | `register()` fails with restricted worker permission |

### `globalPreload` (2)

`globalPreload` is deprecated upstream in Node.js and is not supported by this
ponyfill.

| Test file | Reason |
| --- | --- |
| `globalpreload-no-warning-with-initialize` | `globalPreload` silenced by `initialize()` |
| `globalpreload-warning` | `globalPreload` deprecation warning |

### `require.resolve` / `require()` interop (3)

`require.resolve()` does not trigger `registerHooks()` resolve hooks (upstream
bug, reproduced in `repro/require-resolve-hooks-bug.mjs` on v24 and v25).
`use-hooks-require-esm` depends on `--no-experimental-require-module`.

| Test file | Reason |
| --- | --- |
| `require-resolve-default` | `require.resolve` bypasses `registerHooks()` (upstream bug) |
| `require-resolve-opt-in` | Same upstream bug |
| `use-hooks-require-esm` | Depends on `--no-experimental-require-module` flag |

### Node.js internals (3)

These tests verify internal Node.js behaviors that are not part of the
`module.register()` public API contract.

| Test file | Reason |
| --- | --- |
| `no-leak-internals` | Verifies no Node.js internals leak through hooks |
| `remove-beforeexit-listener` | Worker `beforeExit` listener cleanup |
| `source-maps-cjs` | Passthru load hooks for CJS deadlock (see README) |

## Summary

| Category | Count |
| --- | --- |
| Ported | 10 |
| `--experimental-loader` only | 13 |
| Never-settling hooks | 10 |
| `process.exit` from hooks | 4 |
| Permission model | 3 |
| `globalPreload` | 2 |
| `require.resolve` / `require()` interop | 3 |
| Node.js internals | 3 |
| **Total** | **48** |
