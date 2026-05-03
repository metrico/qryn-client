const { describe, it } = require('node:test');
const assert = require('node:assert');
const { GigapipeError, GigapipeAbortedError, GigapipeTimeoutError } = require('../src/types');

describe('GigapipeAbortedError', () => {
  it('extends GigapipeError', () => {
    const err = new GigapipeAbortedError('aborted', { reason: 'user-cancel' });
    assert.ok(err instanceof Error);
    assert.ok(err instanceof GigapipeError);
    assert.ok(err instanceof GigapipeAbortedError);
    assert.equal(err.name, 'GigapipeAbortedError');
    assert.equal(err.reason, 'user-cancel');
  });

  it('defaults reason to undefined when not supplied', () => {
    const err = new GigapipeAbortedError('aborted');
    assert.equal(err.reason, undefined);
  });
});

describe('GigapipeTimeoutError', () => {
  it('extends GigapipeError and exposes elapsedMs', () => {
    const err = new GigapipeTimeoutError('timed out', { elapsedMs: 1234, path: '/loki/api/v1/query' });
    assert.ok(err instanceof GigapipeError);
    assert.equal(err.name, 'GigapipeTimeoutError');
    assert.equal(err.elapsedMs, 1234);
    assert.equal(err.path, '/loki/api/v1/query');
  });
});
