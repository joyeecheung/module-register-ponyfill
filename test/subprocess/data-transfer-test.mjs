// Test subprocess: register a hook with data and MessagePort via transferList.
import { register } from '../../src/index.js';
import { MessageChannel } from 'node:worker_threads';

const { port1, port2 } = new MessageChannel();

register('../fixtures/data-hook.mjs', import.meta.url, {
  data: { port: port2, greeting: 'hello from main' },
  transferList: [port2],
});

// Wait for the ack from the hook's initialize().
const result = await new Promise((resolve, reject) => {
  const timeout = setTimeout(() => reject(new Error('Timed out waiting for ack')), 5000);
  port1.on('message', (msg) => {
    clearTimeout(timeout);
    resolve(msg);
  });
});

port1.close();
console.log(JSON.stringify(result));
