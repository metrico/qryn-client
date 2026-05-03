const { describe, it } = require('node:test');
const assert = require('node:assert');
const pkg = require('../src/index');

describe('package exports', () => {
  it('exports GigapipeClient, Stream, Metric, Collector', () => {
    assert.equal(typeof pkg.GigapipeClient, 'function');
    assert.equal(typeof pkg.Stream, 'function');
    assert.equal(typeof pkg.Metric, 'function');
    assert.equal(typeof pkg.Collector, 'function');
  });

  it('exports the typed errors and response', () => {
    assert.equal(typeof pkg.GigapipeError, 'function');
    assert.equal(typeof pkg.GigapipeAbortedError, 'function');
    assert.equal(typeof pkg.GigapipeTimeoutError, 'function');
    assert.equal(typeof pkg.GigapipeResponse, 'function');
  });
});
