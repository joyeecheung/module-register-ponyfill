/**
 * First hook in chain
 */
export async function initialize() {
  console.log('hook1 initialized');
}

export async function resolve(specifier, context, nextResolve) {
  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  return nextLoad(url, context);
}
