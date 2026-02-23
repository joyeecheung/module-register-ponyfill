// Hook that resolves and loads a fully virtual module (no backing file).
// Resolves 'virtual:greeting' to a synthetic URL, then provides source for it.

export function resolve(specifier, context, nextResolve) {
  if (specifier === 'virtual:greeting') {
    return {
      url: 'virtual:greeting',
      shortCircuit: true,
    };
  }
  return nextResolve(specifier, context);
}

export function load(url, context, nextLoad) {
  if (url === 'virtual:greeting') {
    return {
      format: 'module',
      source: 'export const greeting = "hello from virtual land";',
      shortCircuit: true,
    };
  }
  return nextLoad(url, context);
}
