const { test } = require('node:test');
const assert = require('node:assert/strict');
const { toNanos } = require('../../src/utils/time');

test('Date → nanoseconds string', () => {
  const d = new Date(1700000000000); // 2023-11-14T22:13:20Z
  assert.equal(toNanos(d), '1700000000000000000');
});

test('seconds heuristic (number < 1e12) → nanoseconds', () => {
  assert.equal(toNanos(1700000000), '1700000000000000000');
});

test('milliseconds heuristic (1e12 <= number < 1e15) → nanoseconds', () => {
  assert.equal(toNanos(1700000000000), '1700000000000000000');
});

test('nanoseconds heuristic (number >= 1e15) → unchanged (string form)', () => {
  assert.equal(toNanos(1700000000000000000), '1700000000000000000');
});

test('string passes through unchanged', () => {
  assert.equal(toNanos('1700000000000000123'), '1700000000000000123');
});

test('throws on null/undefined', () => {
  assert.throws(() => toNanos(null));
  assert.throws(() => toNanos(undefined));
});
