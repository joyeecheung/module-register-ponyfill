import { register } from '../../index.js';

register(new URL('./hook.mjs', import.meta.url).href);

setInterval(() => process.removeAllListeners('beforeExit'), 1).unref();
await import('data:text/javascript,');
