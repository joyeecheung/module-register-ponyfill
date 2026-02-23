// A hook that uses initialize() to receive data and a MessagePort.

let _receivedData = null;

export function initialize(data) {
  _receivedData = data;
  // If a port was provided, send an ack back.
  if (data?.port) {
    data.port.postMessage({ ack: true, greeting: data.greeting });
  }
}

export function resolve(specifier, context, nextResolve) {
  return nextResolve(specifier, context);
}

export function load(url, context, nextLoad) {
  return nextLoad(url, context);
}
