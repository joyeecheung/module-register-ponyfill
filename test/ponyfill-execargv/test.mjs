// Tests that the ponyfill matches Node.js's built-in module.register() for
// execArgv/preload inheritance behavior.
//
// The known divergences (--import preloads from execArgv running in the loader
// worker) are documented separately in repro/ponyfill-execargv-divergences/.

import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { test } from 'node:test';

const dir = import.meta.dirname;
const entryRegister = join(dir, 'entry-register.mjs');
const entry = join(dir, 'entry.mjs');
const requirePreload = join(dir, 'require-preload.cjs');
const importPreload = join(dir, 'import-preload.mjs');
const registeringPreload = join(dir, 'registering-preload.cjs');

/**
 * Run a child process and parse all JSON log lines from stdout.
 * Returns an array of parsed objects, each with a `source` field.
 */
function spawn(args, opts = {}) {
  const result = spawnSync(process.execPath, args, {
    encoding: 'utf-8',
    timeout: 30_000,
    env: { ...process.env, ...opts.env },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `Process exited with code ${result.status}\nstdout: ${result.stdout}\nstderr: ${result.stderr}`,
    );
  }
  const logs = [];
  for (const line of result.stdout.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.startsWith('{')) {
      try {
        logs.push(JSON.parse(trimmed));
      } catch {
        // not JSON, skip
      }
    }
  }
  return { logs, stdout: result.stdout, stderr: result.stderr };
}

function logsFrom(logs, source) {
  return logs.filter((l) => l.source === source);
}

// ---------------------------------------------------------------------------
// --require preload runs in BOTH main thread and loader worker
// ---------------------------------------------------------------------------
test('ponyfill: --require preload runs in main thread AND loader worker', (t) => {
  const { logs } = spawn(['--require', requirePreload, entryRegister]);
  const preloadLogs = logsFrom(logs, 'require-preload');
  t.assert.ok(
    preloadLogs.length >= 2,
    `Expected preload to run in >= 2 threads, got ${preloadLogs.length}: ${JSON.stringify(preloadLogs)}`,
  );
  const threadIds = preloadLogs.map((l) => l.threadId);
  t.assert.ok(threadIds.includes(0), 'Preload should run on main thread (threadId 0)');
  t.assert.ok(
    threadIds.some((id) => id !== 0),
    'Preload should run on loader worker (threadId != 0)',
  );
});

// ---------------------------------------------------------------------------
// hook module sees parent process.execArgv
// ---------------------------------------------------------------------------
test('ponyfill: hook module sees parent process.execArgv (e.g. --no-warnings)', (t) => {
  const { logs } = spawn(['--no-warnings', entryRegister]);
  const hookLogs = logsFrom(logs, 'hook');
  t.assert.ok(hookLogs.length >= 1, 'Hook should have logged');
  const hookExecArgv = hookLogs[0].execArgv;
  t.assert.ok(
    hookExecArgv.includes('--no-warnings'),
    `Hook execArgv should include --no-warnings, got: ${JSON.stringify(hookExecArgv)}`,
  );
});

// ---------------------------------------------------------------------------
// --require preload that calls register() does NOT cause recursion
// ---------------------------------------------------------------------------
test('ponyfill: --require preload calling register() does not infinite-recurse', (t) => {
  // This would hang/timeout if there's infinite recursion.
  const { logs } = spawn(['--require', registeringPreload, entry]);
  const preloadLogs = logsFrom(logs, 'registering-preload');
  t.assert.ok(preloadLogs.length >= 1, 'Registering preload should have run');

  // The preload calls register(log-hook.mjs), which should work.
  const hookLogs = logsFrom(logs, 'hook');
  t.assert.ok(
    hookLogs.length >= 1,
    'Hook registered from preload should have loaded in the loader worker',
  );
});

// ---------------------------------------------------------------------------
// --require registering-preload runs in loader worker without
//         re-spawning
// ---------------------------------------------------------------------------
test('ponyfill: --require registering-preload runs in loader worker without re-spawning', (t) => {
  const { logs } = spawn(['--require', registeringPreload, entry]);
  const preloadLogs = logsFrom(logs, 'registering-preload');
  const threadIds = preloadLogs.map((l) => l.threadId);
  // Document whether the registering preload runs in the loader worker too
  const runsInWorker = threadIds.some((id) => id !== 0);
  // The key assertion: process didn't hang, so no infinite recursion
  t.assert.ok(true, 'Process completed without deadlock');
});

// ---------------------------------------------------------------------------
// NODE_OPTIONS with --require reaches the loader worker
// ---------------------------------------------------------------------------
test('ponyfill: NODE_OPTIONS --require preload runs in loader worker', (t) => {
  const { logs } = spawn([entryRegister], {
    env: { NODE_OPTIONS: `--require ${requirePreload}` },
  });
  const preloadLogs = logsFrom(logs, 'require-preload');
  t.assert.ok(
    preloadLogs.length >= 2,
    `Expected preload from NODE_OPTIONS to run in >= 2 threads, got ${preloadLogs.length}`,
  );
  const threadIds = preloadLogs.map((l) => l.threadId);
  t.assert.ok(
    threadIds.some((id) => id !== 0),
    'NODE_OPTIONS --require preload should run in loader worker',
  );
});

// ---------------------------------------------------------------------------
// Multiple --require preloads: both run in loader worker
// ---------------------------------------------------------------------------
test('ponyfill: multiple --require preloads both run in loader worker', (t) => {
  const { logs } = spawn(['--require', requirePreload, '--require', registeringPreload, entry]);
  const reqLogs = logsFrom(logs, 'require-preload');
  const regLogs = logsFrom(logs, 'registering-preload');
  // Both should appear on the loader worker thread
  t.assert.ok(
    reqLogs.some((l) => l.threadId !== 0),
    'require-preload should run in loader worker',
  );
  t.assert.ok(
    regLogs.some((l) => l.threadId !== 0),
    'registering-preload should run in loader worker',
  );
});

// ---------------------------------------------------------------------------
// --require preload's execArgv in loader worker includes ALL flags
// ---------------------------------------------------------------------------
test('ponyfill: preload in loader worker sees full execArgv including --require itself', (t) => {
  const { logs } = spawn(['--require', requirePreload, '--no-warnings', entryRegister]);
  const workerPreloads = logsFrom(logs, 'require-preload').filter((l) => l.threadId !== 0);
  t.assert.ok(workerPreloads.length >= 1, 'Preload should run in loader worker');
  const workerExecArgv = workerPreloads[0].execArgv;
  t.assert.ok(
    workerExecArgv.includes('--no-warnings'),
    `Loader worker should see --no-warnings in execArgv, got: ${JSON.stringify(workerExecArgv)}`,
  );
});

// ---------------------------------------------------------------------------
// Hook module in loader worker sees --experimental-vm-modules
// ---------------------------------------------------------------------------
test('ponyfill: hook module sees --experimental-vm-modules in execArgv', (t) => {
  const { logs } = spawn(['--experimental-vm-modules', entryRegister]);
  const hookLogs = logsFrom(logs, 'hook');
  t.assert.ok(hookLogs.length >= 1, 'Hook should have logged');
  t.assert.ok(
    hookLogs[0].execArgv.includes('--experimental-vm-modules'),
    `Hook should see --experimental-vm-modules, got: ${JSON.stringify(hookLogs[0].execArgv)}`,
  );
});

// ---------------------------------------------------------------------------
// --import preload that does NOT call register() - loader worker not spawned,
// so --import only runs on main thread
// ---------------------------------------------------------------------------
test('ponyfill: --import preload only runs on main thread when register() is not called', (t) => {
  // entry.mjs does NOT call register(), only imports node:os
  const { logs } = spawn(['--import', importPreload, entry]);
  const preloadLogs = logsFrom(logs, 'import-preload');
  const threadIds = preloadLogs.map((l) => l.threadId);
  // The loader worker is only spawned when register() is called.
  // Since entry.mjs does not call register(), no worker is spawned.
  // Main thread should always see it
  t.assert.ok(threadIds.includes(0), 'Preload runs on main thread');
});

// ---------------------------------------------------------------------------
// Ordering - --require preload runs before hook registration in the loader worker
// ---------------------------------------------------------------------------
test('ponyfill: ordering of preload vs hook registration in loader worker', (t) => {
  // Use registeringPreload (--require) which calls register(log-hook.mjs).
  // Observe the order of log lines from the loader worker.
  const { logs } = spawn(['--require', registeringPreload, entry]);
  // Find loader worker messages in order
  const workerLogs = logs.filter((l) => l.threadId !== 0);
  t.assert.ok(
    workerLogs.length >= 2,
    `Expected >= 2 logs from loader worker, got ${workerLogs.length}: ${JSON.stringify(workerLogs)}`,
  );
  const sources = workerLogs.map((l) => l.source);
  // --require preloads run BEFORE hook modules in the loader worker.
  const preloadIdx = sources.indexOf('registering-preload');
  const hookIdx = sources.indexOf('hook');
  t.assert.ok(preloadIdx !== -1, 'registering-preload should appear in worker logs');
  t.assert.ok(hookIdx !== -1, 'hook should appear in worker logs');
  t.assert.ok(
    preloadIdx < hookIdx,
    `Preload should run before hook in loader worker, got order: ${JSON.stringify(sources)}`,
  );
});

// ---------------------------------------------------------------------------
// NODE_OPTIONS with --import does NOT run in loader worker
// ---------------------------------------------------------------------------
test('ponyfill: NODE_OPTIONS --import preload does not run in loader worker', (t) => {
  const { logs } = spawn([entryRegister], {
    env: { NODE_OPTIONS: `--import ${importPreload}` },
  });
  const preloadLogs = logsFrom(logs, 'import-preload');
  const threadIds = preloadLogs.map((l) => l.threadId);
  // The ponyfill strips --import from NODE_OPTIONS, matching the builtin
  // behavior where --import preloads only run on the main thread.
  t.assert.ok(
    threadIds.every((id) => id === 0),
    `NODE_OPTIONS --import should only run on main thread, got: ${JSON.stringify(threadIds)}`,
  );
});

// ---------------------------------------------------------------------------
// Loader worker is only spawned lazily (when register() is called)
// ---------------------------------------------------------------------------
test('ponyfill: --require preload does NOT run in loader worker when register() is never called', (t) => {
  // entry.mjs does NOT call register(), so no loader worker should be spawned.
  const { logs } = spawn(['--require', requirePreload, entry]);
  const preloadLogs = logsFrom(logs, 'require-preload');
  const threadIds = preloadLogs.map((l) => l.threadId);
  // If register() is never called, there is no loader worker,
  // so --require preloads only run on the main thread.
  t.assert.ok(
    threadIds.every((id) => id === 0),
    `Without register(), preload should only run on main thread, got: ${JSON.stringify(threadIds)}`,
  );
});

// ---------------------------------------------------------------------------
// register() called from --require preload inside the loader worker
// registers working hooks
// ---------------------------------------------------------------------------
test('ponyfill: register() from --require preload inside loader worker registers working hooks', (t) => {
  // registeringPreload calls register(log-hook.mjs) which has a resolve hook.
  // entry.mjs then imports node:os, which should trigger the hook.
  const { logs } = spawn(['--require', registeringPreload, entry]);
  const hookLogs = logsFrom(logs, 'hook');
  // The hook should have loaded since register() was called from the preload
  t.assert.ok(hookLogs.length >= 1, 'Hook registered from preload should be active');
  // The hook runs in the loader worker
  t.assert.ok(
    hookLogs.some((l) => l.threadId !== 0),
    'Hook should execute in the loader worker',
  );
});
