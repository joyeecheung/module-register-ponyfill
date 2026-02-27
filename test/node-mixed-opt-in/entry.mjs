import { register } from '../../index.js';

register(new URL('./hook.mjs', import.meta.url).href);
await import('entry-point');
