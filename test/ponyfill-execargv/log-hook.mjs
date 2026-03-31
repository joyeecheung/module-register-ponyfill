// Hook module that logs environment details from the loader worker.
// Used by multiple test cases to observe what the loader worker inherits.

import { writeSync } from 'node:fs';
import { threadId } from 'node:worker_threads';

// Log details so the parent process can parse them.
writeSync(
  1,
  JSON.stringify({
    source: 'hook',
    threadId,
    execArgv: process.execArgv,
    env: {
      NODE_OPTIONS: process.env.NODE_OPTIONS || null,
    },
  }) + '\n',
);

// Minimal resolve hook so register() considers this a valid hook module.
export function resolve(specifier, context, nextResolve) {
  return nextResolve(specifier, context);
}
