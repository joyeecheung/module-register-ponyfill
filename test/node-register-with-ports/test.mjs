// Ported from Node.js: test-async-loader-hooks-register-with-ports.mjs
// Tests that register() supports data + transferList with MessagePort,
// and that the hook can communicate back through the port.
import { once } from 'node:events';
import { test } from 'node:test';
import { MessageChannel } from 'node:worker_threads';
import { register } from '../../index.js';

const { port1, port2 } = new MessageChannel();
const messages = [];
port1.on('message', (msg) => {
  messages.push(msg);
});

register('./hook.mjs', import.meta.url, {
  data: port2,
  transferList: [port2],
});

test('node-register-with-ports: register with MessagePort via transferList', async (t) => {
  t.plan(3);

  // Keep the process alive long enough for messages.
  const timeout = setTimeout(() => {}, 30000);
  try {
    // Wait for initialize message, then trigger a resolve.
    await once(port1, 'message');
    await import('node:os');
    // Wait for the resolve message.
    if (messages.length < 2) {
      await once(port1, 'message');
    }
  } finally {
    clearTimeout(timeout);
    port1.close();
  }

  t.assert.strictEqual(messages[0], 'initialize');
  t.assert.strictEqual(messages[1], 'resolve node:os');
  t.assert.strictEqual(messages.length, 2);
});
