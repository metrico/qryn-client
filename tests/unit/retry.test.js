const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  DEFAULT_RETRY,
  computeBackoff,
  parseRetryAfter,
  isRetryableStatus,
  isRetryableNetworkError
} = require('../../src/utils/retry');

test('DEFAULT_RETRY matches spec defaults', () => {
  assert.equal(DEFAULT_RETRY.attempts, 3);
  assert.equal(DEFAULT_RETRY.baseDelayMs, 200);
  assert.equal(DEFAULT_RETRY.maxDelayMs, 5000);
});

test('computeBackoff: exponential growth, capped at maxDelayMs', (t) => {
  // Force jitter to identity for assertable math.
  const random = () => 1.0;
  assert.equal(computeBackoff(1, { baseDelayMs: 200, maxDelayMs: 5000 }, random), 200);
  assert.equal(computeBackoff(2, { baseDelayMs: 200, maxDelayMs: 5000 }, random), 400);
  assert.equal(computeBackoff(3, { baseDelayMs: 200, maxDelayMs: 5000 }, random), 800);
  assert.equal(computeBackoff(10, { baseDelayMs: 200, maxDelayMs: 5000 }, random), 5000);
});

test('computeBackoff: jitter scales the delay by [0,1)', () => {
  const fixed = computeBackoff(2, { baseDelayMs: 200, maxDelayMs: 5000 }, () => 0.5);
  assert.equal(fixed, 200);
});

test('parseRetryAfter: numeric seconds', () => {
  assert.equal(parseRetryAfter('5'), 5000);
  assert.equal(parseRetryAfter('0'), 0);
});

test('parseRetryAfter: HTTP-date', () => {
  const future = new Date(Date.now() + 3000);
  const ms = parseRetryAfter(future.toUTCString());
  assert.ok(ms >= 2000 && ms <= 4000);
});

test('parseRetryAfter: invalid → null', () => {
  assert.equal(parseRetryAfter('garbage'), null);
  assert.equal(parseRetryAfter(undefined), null);
  assert.equal(parseRetryAfter(null), null);
});

test('isRetryableStatus: only 408, 429, 502, 503, 504', () => {
  for (const s of [408, 429, 502, 503, 504]) {
    assert.equal(isRetryableStatus(s), true, `${s} should be retryable`);
  }
  for (const s of [200, 400, 401, 403, 404, 422, 500, 501]) {
    assert.equal(isRetryableStatus(s), false, `${s} must not be retryable`);
  }
});

test('isRetryableNetworkError: known codes', () => {
  for (const code of ['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'EAI_AGAIN']) {
    assert.equal(isRetryableNetworkError({ code }), true);
    assert.equal(isRetryableNetworkError({ cause: { code } }), true);
  }
  assert.equal(isRetryableNetworkError({ code: 'EPERM' }), false);
  assert.equal(isRetryableNetworkError(null), false);
});
