// Error serialization / deserialization for cross-thread transfer.

/**
 * Serialize an error into a plain object suitable for structured clone.
 * @param {unknown} err
 * @returns {{ message: string, name: string, stack?: string, code?: string }}
 */
export function serializeError(err) {
  if (err instanceof Error) {
    return {
      message: err.message,
      name: err.name,
      stack: err.stack,
      code: /** @type {any} */ (err).code,
    };
  }
  // Primitive or non-Error object -- wrap it.
  return {
    message: String(err),
    name: 'Error',
  };
}

/**
 * Deserialize a plain error object back into an Error instance.
 * @param {{ message: string, name: string, stack?: string, code?: string }} serialized
 * @returns {Error}
 */
export function deserializeError(serialized) {
  const err = new Error(serialized.message);
  err.name = serialized.name;
  if (serialized.stack) {
    err.stack = serialized.stack;
  }
  if (serialized.code) {
    /** @type {any} */ (err).code = serialized.code;
  }
  return err;
}
