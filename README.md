# module-register-ponyfill

A user-land ponyfill for `module.register()` built on top of `module.registerHooks()` + worker threads + Atomics.

This provides a drop-in replacement for Node.js's [`module.register()`](https://nodejs.org/api/module.html#moduleregisterspecifier-parenturl-options) that works entirely in user-land, allowing existing consumers of the async hooks API to migrate to the synchronous `module.registerHooks()` infrastructure without changing their hook modules.

## Requirements

- Node.js >= 22.15.0 (for `module.registerHooks()`)

## Installation

```bash
npm install module-register-ponyfill
```

## Usage

### Direct import (ponyfill)

Import `register` directly from the package instead of `node:module`. This is
the simplest approach when you control the call sites:

```js
// Before:
import { register } from 'node:module';
register('./hooks.mjs', import.meta.url);

// After:
import { register } from 'module-register-ponyfill';
register('./hooks.mjs', import.meta.url);
```

### Polyfill (patch `node:module` in-place)

Use the polyfill entry point to monkey-patch `module.register` so that
existing code works without changing import sites.

**Important:** The polyfill must be loaded _before_ any `register()` calls.

The recommended approach is `--import`, which guarantees the polyfill runs
before any application code is evaluated:

```bash
node --import module-register-ponyfill/polyfill your-app.js
```

Alternatively, use a static import placed before any module that calls
`register()`:

```js
// Must come first -- patches module.register before other code runs.
import 'module-register-ponyfill/polyfill';

import { register } from 'node:module';
register('./hooks.mjs', import.meta.url);
```

### Calling conventions

Both calling conventions are supported:

```js
// 3-arg form
register(specifier, parentURL, { data, transferList });

// 2-arg form
register(specifier, { parentURL, data, transferList });
```

### Hook modules

Hook modules work similarly to the ones accepted by the native `module.register()` API. They can export:

- **`initialize(data)`** -- called when the hook is registered, receives the `data` option
- **`resolve(specifier, context, nextResolve)`** -- customize module resolution
- **`load(url, context, nextLoad)`** -- customize module loading

```js
// my-hooks.mjs
export function initialize(data) {
  console.log('Hook initialized with:', data);
}

export function resolve(specifier, context, nextResolve) {
  if (specifier === 'virtual:foo') {
    return { url: 'file:///path/to/foo.js', shortCircuit: true };
  }
  return nextResolve(specifier, context);
}

export function load(url, context, nextLoad) {
  return nextLoad(url, context);
}
```

### Data and transferList

Pass initialization data and transferable objects (e.g. `MessagePort`) to hooks:

```js
import { register } from 'module-register-ponyfill';
import { MessageChannel } from 'node:worker_threads';

const { port1, port2 } = new MessageChannel();

register('./hooks.mjs', import.meta.url, {
  data: { port: port2, config: { debug: true } },
  transferList: [port2],
});

port1.on('message', (msg) => console.log('From hook:', msg));
```

### Multiple registrations

Multiple `register()` calls are supported. Hooks chain in LIFO order (last registered runs first), matching the native behavior:

```js
register('./hook-a.mjs', import.meta.url);
register('./hook-b.mjs', import.meta.url);
// hook-b's resolve/load runs first. When it calls nextResolve/nextLoad,
// hook-a runs. When hook-a calls next, the Node.js default runs.
// Chain: hook-b -> hook-a -> default
```

## How it works

1. On the first `register()` call, a single worker thread is spawned (with
   `execArgv: []` so `--require`/`--import` preloads are not re-executed)
2. A pair of synchronous hooks is registered on the main thread via `module.registerHooks()`
3. When a module is imported, the sync hooks proxy the request to the worker via `MessagePort` + `Atomics.wait`/`Atomics.notify`
4. The worker runs the async hook chain (all registered hook modules)
5. If the hook chain calls `nextResolve()`/`nextLoad()` all the way to the default, the worker delegates back to the main thread's `nextResolve`/`nextLoad` via bidirectional communication
6. Results flow back to the main thread, which unblocks and returns them

All `Atomics.wait()` calls use a 60-second timeout by default. If a hook
hangs or the worker crashes silently, the caller receives a descriptive
timeout error instead of deadlocking.

The timeout is configurable via the `MODULE_REGISTER_TIMEOUT_MS` environment
variable:

```bash
# Increase to 120 seconds for slow CI environments
MODULE_REGISTER_TIMEOUT_MS=120000 node your-app.js
```

## Unsupported features

- **Cross-hook loading effects**: Earlier `register()` calls do not affect the loading of later hook modules in the worker. In native Node.js, previously registered async hooks can affect how subsequent hook modules are loaded (e.g., a TypeScript hook enabling loading of a `.ts` hook module). This requires special handling internally in Node.js that is on the way of removal as it's very race-prone. This user-land ponyfill does not provide it - for something like this to work, it's recommended to just migrate to use the `module.registerHooks()` API.

- **`globalPreload`**: The deprecated `globalPreload` hook export is not recognized. Use `initialize` instead.

## Bonus features

### `deregister()`

Unlike the native `module.register()`, this ponyfill returns a handle with a `deregister()` method:

```js
const handle = register('./hooks.mjs', import.meta.url);

// Later, remove the hook:
handle.deregister();
```

This is possible because we control the hook chain in the worker. The native API has no equivalent.

### Timeout on deadlock

All `Atomics.wait()` calls use a 60-second timeout by default. If a hook hangs or the worker crashes silently, the caller receives a descriptive error instead of deadlocking forever. The timeout is configurable via `MODULE_REGISTER_TIMEOUT_MS` (see above). Native `module.register()` has no such safeguard.

## TypeScript

Type definitions are included. Both the main export and the polyfill entry
point are typed:

```ts
import { register } from 'module-register-ponyfill';
import type { RegisterOptions } from 'module-register-ponyfill';
```

## License

MIT
