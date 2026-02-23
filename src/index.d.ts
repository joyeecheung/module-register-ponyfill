/**
 * Options for the `register()` function.
 */
export interface RegisterOptions {
  /**
   * If you want to resolve `specifier` relative to a base URL, such as
   * `import.meta.url`, you can pass that URL here. This property is ignored
   * if `parentURL` is supplied as the second argument.
   *
   * @default 'data:'
   */
  parentURL?: string | URL;

  /**
   * Any arbitrary, cloneable JavaScript value to pass into the
   * `initialize` hook.
   */
  data?: unknown;

  /**
   * Transferable objects to be passed into the `initialize` hook.
   */
  transferList?: unknown[];
}

/**
 * Register a module that exports hooks to customize Node.js module resolution
 * and loading. Drop-in replacement for `module.register()`.
 *
 * @param specifier - Customization hooks module to register. If relative, it
 *   is resolved relative to `parentURL`.
 * @param parentURL - Base URL for resolving a relative `specifier`.
 * @param options - Additional options including `data` and `transferList`.
 */
export function register(
  specifier: string | URL,
  parentURL: string | URL,
  options?: RegisterOptions,
): void;

/**
 * Register a module that exports hooks to customize Node.js module resolution
 * and loading. Drop-in replacement for `module.register()`.
 *
 * @param specifier - Customization hooks module to register. If relative, it
 *   is resolved relative to `options.parentURL`.
 * @param options - Options including `parentURL`, `data`, and `transferList`.
 */
export function register(
  specifier: string | URL,
  options?: RegisterOptions,
): void;
