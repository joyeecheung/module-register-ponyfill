// CJS preload that logs threadId to stdout.
// Loaded via --require to test whether --require preloads run in the loader worker.
const { writeSync } = require('node:fs');
const { threadId } = require('node:worker_threads');
writeSync(
  1,
  JSON.stringify({
    source: 'require-preload',
    threadId,
    execArgv: process.execArgv,
  }) + '\n',
);
