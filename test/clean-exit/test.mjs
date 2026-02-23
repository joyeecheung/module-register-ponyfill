import { test } from 'node:test';
import { register } from '../../index.js';

register('./hook.mjs', import.meta.url);

// If the worker thread is not properly unref'd, this process will hang after
// the test and node --test's timeout will kill it and fail the suite.
test('clean-exit: process exits without hanging after register()', { timeout: 15_000 }, (t) => {
  t.plan(0);
});
