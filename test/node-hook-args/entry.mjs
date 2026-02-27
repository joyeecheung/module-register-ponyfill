import { register } from '../../index.js';

register(new URL('./hook.mjs', import.meta.url).href);
await import(new URL('./json-modules.mjs', import.meta.url).href);
