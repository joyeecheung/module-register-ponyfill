// Tests for known divergences in the ponyfill's execArgv/preload inheritance.
//
// These divergences cannot be avoided because:
//
// - Passing explicit execArgv to a Worker triggers validation that rejects
//   process-level flags (ERR_WORKER_INVALID_EXEC_ARGV).
// - Omitting execArgv lets the Worker inherit the parent's full execArgv,
//   bypassing validation but also inheriting EVERYTHING, including --import.
//
// Node.js's internal loader worker also inherits the full execArgv, but
// suppresses --import processing internally (--import only runs for the main
// entry point via run_main.js). Standard Workers lack this suppression.
//
// The workerData.__ponyfillLoaderWorker guard in register.js and polyfill.js
// prevents recursion from --import preloads that call register() or load the
// polyfill, so the divergence is harmless in practice.
//
// Run: node --test repro/ponyfill-execargv-divergences/test.mjs

import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { test } from 'node:test';

// Reuse fixtures from the ponyfill-execargv test directory.
const fixtureDir = join(import.meta.dirname, '../../test/ponyfill-execargv');
const entryRegister = join(fixtureDir, 'entry-register.mjs');
const requirePreload = join(fixtureDir, 'require-preload.cjs');
const importPreload = join(fixtureDir, 'import-preload.mjs');

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
// DIVERGENCE 1: --import preloads from execArgv run in the loader worker.
//
// Built-in behavior: --import preload runs on the main thread ONLY.
// Ponyfill behavior: --import preload runs on main thread AND loader worker.
//
// Root cause: The ponyfill omits execArgv from the Worker constructor, so
// the Worker inherits the parent's full execArgv (including --import).
// Node.js's internal loader worker uses the same inheritance but suppresses
// --import processing internally (only the main entry point runs --import
// preloads). Standard Workers lack this suppression.
//
// Mitigation: The isPonyfillLoaderWorker guard in register.js and polyfill.js
// prevents recursion. The extra --import execution is harmless but observable.
// ---------------------------------------------------------------------------
test('ponyfill divergence: --import preload runs in loader worker (builtin: main only)', (t) => {
  const { logs } = spawn(['--import', importPreload, entryRegister]);
  const preloadLogs = logsFrom(logs, 'import-preload');
  const threadIds = preloadLogs.map((l) => l.threadId);

  // Builtin: exactly 1 (main thread only).
  // Ponyfill: >= 2 (main + worker) because --import is inherited via execArgv.
  t.assert.ok(
    preloadLogs.length >= 2,
    `Expected --import preload in >= 2 threads (main + worker), got ${preloadLogs.length}: ${JSON.stringify(threadIds)}`,
  );
  t.assert.ok(threadIds.includes(0), 'Should run on main thread');
  t.assert.ok(
    threadIds.some((id) => id !== 0),
    'Should also run in loader worker (builtin does not)',
  );
});

// ---------------------------------------------------------------------------
// DIVERGENCE 2: --import + --require together -- both run in loader worker.
//
// Built-in behavior: only --require runs in the loader worker; --import does not.
// Ponyfill behavior: both --require and --import run in the loader worker.
//
// Same root cause as divergence 1. The --require part matches the builtin.
// The --import part is the divergence.
// ---------------------------------------------------------------------------
test('ponyfill divergence: --require AND --import both run in loader worker (builtin: --require only)', (t) => {
  const { logs } = spawn(['--require', requirePreload, '--import', importPreload, entryRegister]);
  const reqLogs = logsFrom(logs, 'require-preload');
  const impLogs = logsFrom(logs, 'import-preload');

  // --require in loader worker: matches builtin
  t.assert.ok(
    reqLogs.some((l) => l.threadId !== 0),
    'require-preload should run in loader worker (matches builtin)',
  );

  // --import in loader worker: divergence (builtin: main thread only)
  const impThreadIds = impLogs.map((l) => l.threadId);
  t.assert.ok(
    impThreadIds.some((id) => id !== 0),
    'import-preload also runs in loader worker (builtin does not)',
  );
});
