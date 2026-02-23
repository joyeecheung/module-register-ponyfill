/**
 * Polyfill entry point that patches `module.register` with the polyfill
 * implementation. Import this module for its side effect.
 *
 * **Important:** The polyfill must be loaded before any `register()` calls.
 * The recommended approach is `--import`, which guarantees it runs first:
 *
 * ```sh
 * node --import module-register-ponyfill/polyfill your-app.js
 * ```
 *
 * Alternatively, import it before any module that calls `register()`:
 *
 * ```js
 * import 'module-register-ponyfill/polyfill';
 * ```
 *
 * After importing, `module.register()` uses the polyfill.
 */
export {};
