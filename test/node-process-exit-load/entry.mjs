import { register } from '../../index.js';

register('./hook.mjs', import.meta.url);
await import('data:exit');
