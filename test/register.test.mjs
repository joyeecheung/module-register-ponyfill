/**
 * Tests for userland-register package.
 * Run with: node --test userland-register/test/
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { spawn } from 'node:child_process';
import path from 'node:path';

const fixturesDir = path.join(import.meta.dirname, 'fixtures');

// Helper to run a script and capture output
function runScript(scriptPath, args = []) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [scriptPath, ...args], {
      cwd: path.dirname(scriptPath),
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', (code) => {
      resolve({ code, stdout, stderr });
    });

    child.on('error', reject);
  });
}

describe('userland-register', () => {
  it('should register hooks and receive initialize data', async () => {
    const result = await runScript(path.join(fixturesDir, 'initialize.mjs'));
    assert.strictEqual(result.code, 0, `Script failed with stderr: ${result.stderr}`);
    assert.match(result.stdout, /initialize called/);
    assert.match(result.stdout, /greeting.*Hello from test/);
  });

  it('should support MessageChannel communication', async () => {
    const result = await runScript(path.join(fixturesDir, 'message-channel.mjs'));
    assert.strictEqual(result.code, 0, `Script failed with stderr: ${result.stderr}`);
    assert.match(result.stdout, /Received from hooks.*initialized/);
  });

  it('should resolve virtual modules', async () => {
    const result = await runScript(path.join(fixturesDir, 'resolve-hook.mjs'));
    assert.strictEqual(result.code, 0, `Script failed with stderr: ${result.stderr}`);
    assert.match(result.stdout, /virtual module loaded/);
  });

  it('should transform module source with load hook', async () => {
    const result = await runScript(path.join(fixturesDir, 'load-hook.mjs'));
    assert.strictEqual(result.code, 0, `Script failed with stderr: ${result.stderr}`);
    assert.match(result.stdout, /transformed content/);
  });

  it('should chain multiple hook registrations', async () => {
    const result = await runScript(path.join(fixturesDir, 'chaining.mjs'));
    assert.strictEqual(result.code, 0, `Script failed with stderr: ${result.stderr}`);
    assert.match(result.stdout, /hook1 initialized/);
    assert.match(result.stdout, /hook2 initialized/);
  });

  it('should exit cleanly without hanging', async () => {
    const result = await runScript(path.join(fixturesDir, 'exit.mjs'));
    assert.strictEqual(result.code, 0, `Script failed with stderr: ${result.stderr}`);
    assert.match(result.stdout, /exiting cleanly/);
  });
});
