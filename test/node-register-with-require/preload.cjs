// Ported from Node.js: fixtures/es-module-loaders/register-loader.cjs
// CJS file loaded via --require that calls register() to install a load hook.
'use strict';
const { register } = require('node:module');
const { pathToFileURL } = require('node:url');
const { join } = require('node:path');

register(pathToFileURL(join(__dirname, 'hook.mjs')).href);
