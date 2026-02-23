// A combined resolve+load hook for chaining tests.
// Adds a tag to the source to prove it ran.

let tag = 'hook-a';

export function initialize(data) {
  if (data && data.tag) {
    tag = data.tag;
  }
}

export function resolve(specifier, context, nextResolve) {
  return nextResolve(specifier, context);
}

export function load(url, context, nextLoad) {
  const result = nextLoad(url, context);
  if (result.source && typeof result.source === 'string') {
    result.source = `// tagged by ${tag}\n${result.source}`;
  }
  return result;
}
