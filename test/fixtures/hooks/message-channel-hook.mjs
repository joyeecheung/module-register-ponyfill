/**
 * Hook that communicates via MessageChannel
 */
let port;

export async function initialize(data) {
  port = data?.port;
  if (port) {
    port.postMessage({ status: 'initialized' });
  }
}

export async function resolve(specifier, context, nextResolve) {
  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  return nextLoad(url, context);
}
