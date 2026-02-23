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

Replace `module.register()` calls with the ponyfill:

```js
// Before:
import { register } from 'node:module';
register('./hooks.mjs', import.meta.url);

// After:
import { register } from 'module-register-ponyfill';
register('./hooks.mjs', import.meta.url);
```

Alternatively, import the ponyfill entry point to patch `module.register`
in-place so that existing code works without changing import sites:

```js
import 'module-register-ponyfill/ponyfill';

// Now module.register() uses the ponyfill.
import { register } from 'node:module';
register('./hooks.mjs', import.meta.url);
```

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
// hook-b runs first, then hook-a, then the default
```

## How it works

1. On the first `register()` call, a single worker thread is spawned
2. A pair of synchronous hooks is registered on the main thread via `module.registerHooks()`
3. When a module is imported, the sync hooks proxy the request to the worker via `MessagePort` + `Atomics.wait`/`Atomics.notify`
4. The worker runs the async hook chain (all registered hook modules)
5. If the hook chain calls `nextResolve()`/`nextLoad()` all the way to the default, the worker delegates back to the main thread's `nextResolve`/`nextLoad` via bidirectional communication
6. Results flow back to the main thread, which unblocks and returns them

All `Atomics.wait()` calls use a 30-second timeout. If a hook hangs or the
worker crashes silently, the caller receives a descriptive timeout error
instead of deadlocking.

## Differences from native `module.register()`

- **Cross-hook loading effects unsupported**: Earlier `register()` calls do not affect the loading of later hook modules in the worker. In native Node.js, previously registered async hooks can affect how subsequent hook modules are loaded (e.g., a TypeScript hook enabling loading of a `.ts` hook module). This requires special handling internally in Node.js that is on the way of removal as it's very race-prone. This user-land ponyfill does not provide it - for something like this to work, it's recommended to just migrate to use the `module.registerHooks()` API.

- **`globalPreload` not supported**: The deprecated `globalPreload` hook export is not recognized. Use `initialize` instead.

### Bonus: `deregister()`

Unlike the native `module.register()`, this ponyfill returns a handle with a `deregister()` method:

```js
const handle = register('./hooks.mjs', import.meta.url);

// Later, remove the hook:
handle.deregister();
```

This is possible because we control the hook chain in the worker. The native API has no equivalent.

## TypeScript

Type definitions are included. Both the main export and the ponyfill entry
point are typed:

```ts
import { register } from 'module-register-ponyfill';
import type { RegisterOptions } from 'module-register-ponyfill';
```

## License

MIT
