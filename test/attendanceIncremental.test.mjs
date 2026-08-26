import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_OVERLAP_MINUTES } from '../sync/attendanceIncremental.js';

test('uses five-minute attendance overlap', () => {
  assert.equal(DEFAULT_OVERLAP_MINUTES, 5);
});
