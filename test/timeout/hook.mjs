// A resolve hook that never returns -- blocks forever.
// Used to test that the timeout mechanism works.

export function resolve(specifier, context, nextResolve) {
  if (specifier === 'hang:forever') {
    return new Promise(() => {});
  }
  return nextResolve(specifier, context);
}
