// ESM preload that logs threadId to stdout.
// Loaded via --import to test whether --import preloads run in the loader worker.
import { writeSync } from 'node:fs';
import { threadId } from 'node:worker_threads';

writeSync(
  1,
  JSON.stringify({
    source: 'import-preload',
    threadId,
    execArgv: process.execArgv,
  }) + '\n',
);
