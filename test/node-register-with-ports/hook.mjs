// Ported from Node.js: fixtures/es-module-loaders/hooks-initialize-port.mjs
// A hook that receives a MessagePort via initialize(data) and communicates
// back through it.
let thePort = null;

export async function initialize(port) {
  port.postMessage('initialize');
  thePort = port;
}

export async function resolve(specifier, _context, next) {
  if (thePort && !specifier.includes('hook')) {
    thePort.postMessage(`resolve ${specifier}`);
  }
  return next(specifier);
}
