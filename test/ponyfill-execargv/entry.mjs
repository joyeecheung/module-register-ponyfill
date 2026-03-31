// Minimal entry script. Imports a module but does NOT call register().
// Does NOT call register().
import { writeSync } from 'node:fs';
import { threadId } from 'node:worker_threads';

writeSync(
  1,
  JSON.stringify({
    source: 'entry',
    threadId,
  }) + '\n',
);

// Import something to trigger resolve/load hooks.
await import('node:os');
