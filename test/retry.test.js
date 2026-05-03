const { describe, it, mock } = require('node:test');
const assert = require('node:assert');
const {
  computeBackoffMs,
  isRetryableStatus,
  parseRetryAfterMs,
  isRetryableNetworkError,
  DEFAULT_RETRY_OPTIONS
} = require('../src/utils/retry');

describe('computeBackoffMs', () => {
  it('grows exponentially capped at maxDelayMs', () => {
    const restore = mock.method(Math, 'random', () => 0.999999);
    try {
      // floor(0.999999 * exp) — exp values: 200, 400, 800, 5000(cap)
      assert.equal(computeBackoffMs(1, 200, 5000), 199);
      assert.equal(computeBackoffMs(2, 200, 5000), 399);
      assert.equal(computeBackoffMs(3, 200, 5000), 799);
      assert.equal(computeBackoffMs(10, 200, 5000), 4999);
    } finally {
      restore.mock.restore();
    }
  });

  it('applies full jitter (random scaling)', () => {
    const restore = mock.method(Math, 'random', () => 0);
    try {
      assert.equal(computeBackoffMs(3, 200, 5000), 0);
    } finally {
      restore.mock.restore();
    }
  });
});

describe('isRetryableStatus', () => {
  it('matches the spec set: 408, 429, 502, 503, 504', () => {
    for (const s of [408, 429, 502, 503, 504]) {
      assert.equal(isRetryableStatus(s), true, `status ${s} should be retryable`);
    }
  });

  it('does not match other 4xx', () => {
    for (const s of [400, 401, 403, 404, 422]) {
      assert.equal(isRetryableStatus(s), false, `status ${s} should NOT be retryable`);
    }
  });

  it('does not match 2xx/3xx', () => {
    assert.equal(isRetryableStatus(200), false);
    assert.equal(isRetryableStatus(304), false);
  });
});

describe('parseRetryAfterMs', () => {
  it('parses delta-seconds', () => {
    assert.equal(parseRetryAfterMs('5'), 5000);
    assert.equal(parseRetryAfterMs('  10 '), 10000);
  });

  it('parses HTTP-date, returning ms-from-now', () => {
    const future = new Date(Date.now() + 3000).toUTCString();
    const ms = parseRetryAfterMs(future);
    assert.ok(ms >= 2000 && ms <= 4000, `expected ~3000 ms, got ${ms}`);
  });

  it('returns null for unparseable / null input', () => {
    assert.equal(parseRetryAfterMs(null), null);
    assert.equal(parseRetryAfterMs(''), null);
    assert.equal(parseRetryAfterMs('not-a-date'), null);
  });

  it('clamps negative HTTP-date deltas to 0', () => {
    const past = new Date(Date.now() - 60_000).toUTCString();
    assert.equal(parseRetryAfterMs(past), 0);
  });
});

describe('isRetryableNetworkError', () => {
  it('matches the spec error codes', () => {
    for (const code of ['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'EAI_AGAIN']) {
      const err = new Error('boom');
      err.code = code;
      assert.equal(isRetryableNetworkError(err), true, `code ${code} should be retryable`);
      const wrapped = new Error('boom'); wrapped.cause = { code };
      assert.equal(isRetryableNetworkError(wrapped), true, `code ${code} as cause should be retryable`);
    }
  });

  it('does not match unrelated errors', () => {
    const err = new Error('not a network thing'); err.code = 'EACCES';
    assert.equal(isRetryableNetworkError(err), false);
    assert.equal(isRetryableNetworkError(null), false);
    assert.equal(isRetryableNetworkError(new Error('plain')), false);
  });
});

describe('DEFAULT_RETRY_OPTIONS', () => {
  it('matches spec defaults', () => {
    assert.deepEqual(DEFAULT_RETRY_OPTIONS, {
      attempts: 3,
      baseDelayMs: 200,
      maxDelayMs: 5000
    });
  });
});
