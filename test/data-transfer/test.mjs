import { test } from 'node:test';
import { MessageChannel } from 'node:worker_threads';
import { register } from '../../index.js';

const { port1, port2 } = new MessageChannel();

register('./hook.mjs', import.meta.url, {
  data: { port: port2, greeting: 'hello from main' },
  transferList: [port2],
});

test('data + transferList: initialize() receives data with MessagePort', async (t) => {
  t.plan(2);
  // Wait for the ack from the hook's initialize().
  const result = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Timed out waiting for ack')), 5000);
    port1.on('message', (msg) => {
      clearTimeout(timeout);
      resolve(msg);
    });
  });
  port1.close();
  t.assert.strictEqual(result.ack, true);
  t.assert.strictEqual(result.greeting, 'hello from main');
});
