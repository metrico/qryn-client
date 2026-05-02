const { test } = require('node:test');
const assert = require('node:assert/strict');
const { resolveAuthHeaders, normalizeAuth } = require('../../src/services/auth');

test('basic: builds Authorization header', async () => {
  const headers = await resolveAuthHeaders({ type: 'basic', username: 'u', password: 'p' });
  const expected = 'Basic ' + Buffer.from('u:p').toString('base64');
  assert.equal(headers.Authorization, expected);
});

test('bearer: string token', async () => {
  const headers = await resolveAuthHeaders({ type: 'bearer', token: 'abc' });
  assert.equal(headers.Authorization, 'Bearer abc');
});

test('bearer: thunk is awaited each call', async () => {
  let n = 0;
  const tokenFn = async () => `token-${++n}`;
  const a = await resolveAuthHeaders({ type: 'bearer', token: tokenFn });
  const b = await resolveAuthHeaders({ type: 'bearer', token: tokenFn });
  assert.equal(a.Authorization, 'Bearer token-1');
  assert.equal(b.Authorization, 'Bearer token-2');
});

test('custom: object headers', async () => {
  const headers = await resolveAuthHeaders({
    type: 'custom',
    headers: { 'X-Api-Key': 'abc' }
  });
  assert.deepEqual(headers, { 'X-Api-Key': 'abc' });
});

test('custom: thunk headers', async () => {
  const headers = await resolveAuthHeaders({
    type: 'custom',
    headers: async () => ({ 'X-Api-Key': 'fresh' })
  });
  assert.deepEqual(headers, { 'X-Api-Key': 'fresh' });
});

test('undefined auth → empty headers', async () => {
  const headers = await resolveAuthHeaders(undefined);
  assert.deepEqual(headers, {});
});

test('normalizeAuth: legacy {username,password} coerced to basic', () => {
  const result = normalizeAuth({ username: 'u', password: 'p' });
  assert.equal(result.legacy, true);
  assert.deepEqual(result.auth, { type: 'basic', username: 'u', password: 'p' });
});

test('normalizeAuth: typed auth passes through', () => {
  const a = { type: 'bearer', token: 't' };
  const result = normalizeAuth(a);
  assert.equal(result.legacy, false);
  assert.equal(result.auth, a);
});

test('normalizeAuth: undefined passes through', () => {
  const result = normalizeAuth(undefined);
  assert.equal(result.legacy, false);
  assert.equal(result.auth, undefined);
});

test('normalizeAuth: unknown type rejected', () => {
  assert.throws(() => normalizeAuth({ type: 'banana' }));
});
