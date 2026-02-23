// A simple resolve hook that redirects 'virtual:hello' to a real file.

export function resolve(specifier, context, nextResolve) {
  if (specifier === 'virtual:hello') {
    return {
      url: new URL('./virtual-hello.js', import.meta.url).href,
      shortCircuit: true,
    };
  }
  return nextResolve(specifier, context);
}
