import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

test('server modules pass Node syntax validation', () => {
  for (const file of ['server/store.js', 'server/agent.js', 'server/index.js']) {
    assert.equal(spawnSync(process.execPath, ['--check', file]).status, 0, `${file} should parse`);
  }
});
