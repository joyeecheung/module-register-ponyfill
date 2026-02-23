// A hook that uses initialize() to receive data and a MessagePort.

let receivedData = null;

export function initialize(data) {
  receivedData = data;
  // If a port was provided, send an ack back.
  if (data && data.port) {
    data.port.postMessage({ ack: true, greeting: data.greeting });
  }
}

export function resolve(specifier, context, nextResolve) {
  return nextResolve(specifier, context);
}

export function load(url, context, nextLoad) {
  return nextLoad(url, context);
}
