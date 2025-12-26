/**
 * Test: MessageChannel communication between main thread and hooks
 */
import { register, waitForReady } from '../../index.js';
import { MessageChannel } from 'node:worker_threads';

const { port1, port2 } = new MessageChannel();

port1.on('message', (msg) => {
  console.log('Received from hooks:', JSON.stringify(msg));
  port1.close();
});

register('./hooks/message-channel-hook.mjs', {
  parentURL: import.meta.url,
  data: { port: port2 },
  transferList: [port2],
});

await waitForReady();

// Give time for the hook to send its message
setTimeout(() => {
  console.log('test completed');
}, 50);
