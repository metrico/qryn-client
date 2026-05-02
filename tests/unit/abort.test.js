const { test } = require('node:test');
const assert = require('node:assert/strict');
const { anySignal } = require('../../src/utils/abort');

test('returns a signal already aborted when an input is already aborted', () => {
  const a = new AbortController();
  a.abort('first');
  const signal = anySignal([a.signal, new AbortController().signal]);
  assert.equal(signal.aborted, true);
});

test('aborts when the first input aborts', () => {
  const a = new AbortController();
  const b = new AbortController();
  const signal = anySignal([a.signal, b.signal]);
  assert.equal(signal.aborted, false);
  a.abort('boom');
  assert.equal(signal.aborted, true);
});

test('aborts when the second input aborts', () => {
  const a = new AbortController();
  const b = new AbortController();
  const signal = anySignal([a.signal, b.signal]);
  b.abort('boom2');
  assert.equal(signal.aborted, true);
});

test('passes the original reason through', () => {
  const a = new AbortController();
  const reason = new Error('caller abort');
  const signal = anySignal([a.signal]);
  a.abort(reason);
  assert.equal(signal.reason, reason);
});

test('drops null/undefined signals', () => {
  const a = new AbortController();
  const signal = anySignal([null, undefined, a.signal]);
  assert.equal(signal.aborted, false);
  a.abort();
  assert.equal(signal.aborted, true);
});
