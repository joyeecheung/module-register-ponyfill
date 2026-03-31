// CJS preload that calls the ponyfill's register() with log-hook.mjs.
// Calls the ponyfill's register() with log-hook.mjs.
const { writeSync } = require('node:fs');
const { register } = require('../../index.js');
const { threadId } = require('node:worker_threads');
const { pathToFileURL } = require('node:url');
const { join } = require('node:path');

writeSync(
  1,
  JSON.stringify({
    source: 'registering-preload',
    threadId,
  }) + '\n',
);

register(pathToFileURL(join(__dirname, 'log-hook.mjs')).href, pathToFileURL(__filename).href);
