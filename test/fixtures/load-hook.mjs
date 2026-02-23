// A simple load hook that intercepts .txt files and wraps them as ESM.

export function load(url, context, nextLoad) {
  if (url.endsWith('.txt')) {
    const source = `export default ${JSON.stringify('content of fake txt')};`;
    return {
      format: 'module',
      source,
      shortCircuit: true,
    };
  }
  return nextLoad(url, context);
}
