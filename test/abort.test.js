const { describe, it } = require('node:test');
const assert = require('node:assert');
const { anySignal } = require('../src/utils/abort');

describe('anySignal', () => {
  it('returns a single signal that aborts when any input aborts', () => {
    const a = new AbortController();
    const b = new AbortController();
    const combined = anySignal([a.signal, b.signal]);
    assert.equal(combined.aborted, false);
    a.abort('reason-a');
    assert.equal(combined.aborted, true);
    assert.equal(combined.reason, 'reason-a');
  });

  it('returns an already-aborted signal when any input is already aborted', () => {
    const a = new AbortController();
    a.abort('preexisting');
    const b = new AbortController();
    const combined = anySignal([a.signal, b.signal]);
    assert.equal(combined.aborted, true);
    assert.equal(combined.reason, 'preexisting');
  });

  it('handles a single signal input', () => {
    const a = new AbortController();
    const combined = anySignal([a.signal]);
    assert.equal(combined.aborted, false);
    a.abort();
    assert.equal(combined.aborted, true);
  });

  it('handles undefined entries (filters them)', () => {
    const a = new AbortController();
    const combined = anySignal([undefined, a.signal, null]);
    assert.equal(combined.aborted, false);
    a.abort();
    assert.equal(combined.aborted, true);
  });

  it('returns a never-aborting signal when no valid signals are passed', () => {
    const combined = anySignal([undefined, null]);
    assert.equal(combined.aborted, false);
  });
});
