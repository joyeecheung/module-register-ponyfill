// Entry script that calls the PONYFILL register() with log-hook.mjs.
// Calls the PONYFILL register() with log-hook.mjs.
import { writeSync } from 'node:fs';
import { threadId } from 'node:worker_threads';
import { register } from '../../index.js';

writeSync(
  1,
  JSON.stringify({
    source: 'entry-register',
    threadId,
  }) + '\n',
);

register('./log-hook.mjs', import.meta.url);

// Import something to trigger resolve/load hooks.
await import('node:os');
