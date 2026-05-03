const { describe, it } = require('node:test');
const assert = require('node:assert');
const { toNanos } = require('../src/utils/time');

describe('toNanos', () => {
  it('converts Date to nanoseconds string', () => {
    const d = new Date('2026-01-01T00:00:00Z');
    assert.equal(toNanos(d), String(d.getTime() * 1_000_000));
  });

  it('treats number < 1e12 as seconds', () => {
    assert.equal(toNanos(1_700_000_000), '1700000000000000000');
  });

  it('treats number in [1e12, 1e15) as milliseconds', () => {
    assert.equal(toNanos(1_700_000_000_000), '1700000000000000000');
  });

  it('treats number >= 1e15 as nanoseconds', () => {
    assert.equal(toNanos(1_700_000_000_000_000_000), '1700000000000000000');
  });

  it('passes string through unchanged', () => {
    assert.equal(toNanos('1700000000000000000'), '1700000000000000000');
    assert.equal(toNanos('not-a-number-but-trusted'), 'not-a-number-but-trusted');
  });

  it('returns undefined for nullish input', () => {
    assert.equal(toNanos(undefined), undefined);
    assert.equal(toNanos(null), undefined);
  });
});
