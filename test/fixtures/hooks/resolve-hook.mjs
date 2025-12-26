/**
 * Hook that resolves virtual modules
 */
export async function initialize() {}

export async function resolve(specifier, context, nextResolve) {
  if (specifier === 'virtual:test-module') {
    return {
      url: 'virtual:test-module',
      shortCircuit: true,
    };
  }
  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  if (url === 'virtual:test-module') {
    return {
      format: 'module',
      source: 'export const value = "virtual module loaded";',
      shortCircuit: true,
    };
  }
  return nextLoad(url, context);
}
