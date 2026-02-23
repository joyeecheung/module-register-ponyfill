// Tests for module-register-ponyfill.
// Each test spawns a subprocess to avoid hook state contamination.

import { describe, it } from 'node:test';
import { execFileSync } from 'node:child_process';
import { strict as assert } from 'node:assert';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Run a subprocess test and parse its JSON output.
 * @param {string} scriptFile  Path relative to test/ directory
 * @returns {any}
 */
function runSubprocess(scriptFile) {
  const scriptPath = join(__dirname, scriptFile);
  const stdout = execFileSync(process.execPath, [scriptPath], {
    encoding: 'utf-8',
    timeout: 15_000,
    cwd: join(__dirname, '..'),
    env: { ...process.env },
  });
  // Parse the last non-empty line as JSON (hooks may print warnings).
  const lines = stdout.trim().split('\n');
  const lastLine = lines[lines.length - 1].trim();
  return JSON.parse(lastLine);
}

describe('module-register-ponyfill', () => {
  it('basic: register a hook and import a normal module through default chain', () => {
    const result = runSubprocess('subprocess/basic-test.mjs');
    assert.equal(result.value, 42);
  });

  it('resolve: redirect virtual specifier to a real module', () => {
    const result = runSubprocess('subprocess/resolve-test.mjs');
    assert.equal(result.message, 'hello from virtual module');
  });

  it('load: intercept .txt files and serve custom source', () => {
    const result = runSubprocess('subprocess/load-test.mjs');
    assert.equal(result.default, 'content of fake txt');
  });

  it('chaining: multiple register() calls run in LIFO order', () => {
    const result = runSubprocess('subprocess/chaining-test.mjs');
    // Both hooks should have run -- the module should still export value: 42
    // (the tagging hooks prepend comments but don't change the export).
    assert.equal(result.value, 42);
  });

  it('data + transferList: initialize() receives data with MessagePort', () => {
    const result = runSubprocess('subprocess/data-transfer-test.mjs');
    assert.equal(result.ack, true);
    assert.equal(result.greeting, 'hello from main');
  });

  it('next-default: hook that calls nextResolve/nextLoad works correctly', () => {
    const result = runSubprocess('subprocess/next-default-test.mjs');
    assert.equal(result.value, 42);
  });

  it('error: hook errors propagate to the main thread', () => {
    const result = runSubprocess('subprocess/error-test.mjs');
    assert.equal(result.error, true);
    assert.ok(result.message.includes('Intentional hook error'));
  });

  it('virtual-module: resolve + load a fully synthetic module with no backing file', () => {
    const result = runSubprocess('subprocess/virtual-module-test.mjs');
    assert.equal(result.greeting, 'hello from virtual land');
  });

  it('clean-exit: process exits without hanging after register()', () => {
    // The subprocess timeout in runSubprocess (15s) acts as the hang detector.
    const result = runSubprocess('subprocess/clean-exit-test.mjs');
    assert.equal(result.exited, true);
  });

  it('ponyfill: importing ponyfill entry patches module.register()', () => {
    const result = runSubprocess('subprocess/ponyfill-test.mjs');
    assert.equal(result.message, 'hello from virtual module');
  });

  it('deregister: removing a hook makes it stop participating in resolution', () => {
    const result = runSubprocess('subprocess/deregister-test.mjs');
    assert.equal(result.before, 'hello from virtual land');
    assert.equal(result.deregistered, true);
  });
});
