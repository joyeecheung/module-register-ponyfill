/**
 * Hook that logs initialize data
 */
export async function initialize(data) {
  console.log('initialize called with:', JSON.stringify(data));
}

export async function resolve(specifier, context, nextResolve) {
  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  return nextLoad(url, context);
}
