// A hook that throws an error during load.

export function load(url, context, nextLoad) {
  if (url.endsWith('.broken')) {
    throw new Error('Intentional hook error');
  }
  return nextLoad(url, context);
}
