import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { register } from '../../index.js';

register(pathToFileURL(join(import.meta.dirname, 'hook.mjs')).href);
