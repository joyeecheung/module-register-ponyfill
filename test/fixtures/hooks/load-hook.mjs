/**
 * Hook that transforms module source
 */
export async function initialize() {}

export async function resolve(specifier, context, nextResolve) {
  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  if (url.endsWith('sample.mjs')) {
    return {
      format: 'module',
      source: 'export const message = "transformed content";',
      shortCircuit: true,
    };
  }
  return nextLoad(url, context);
}
