const { test } = require('node:test');
const assert = require('node:assert/strict');
const Http = require('../../src/services/http');
const { QrynError, QrynAbortedError, QrynTimeoutError } = require('../../src/types');

function mockFetch(impl) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url, init });
    return impl(url, init);
  };
  fn.calls = calls;
  return fn;
}

function jsonOk(body, headers = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json', ...headers }
  });
}

test('basic auth header is set', async () => {
  const fetchSpy = mockFetch(() => jsonOk({ ok: true }));
  const http = new Http('http://q', 60000, {}, { type: 'basic', username: 'u', password: 'p' }, {}, fetchSpy);
  await http.request('/health');
  const auth = fetchSpy.calls[0].init.headers.Authorization;
  assert.equal(auth, 'Basic ' + Buffer.from('u:p').toString('base64'));
});

test('bearer thunk auth header is awaited', async () => {
  const fetchSpy = mockFetch(() => jsonOk({}));
  const http = new Http('http://q', 60000, {}, { type: 'bearer', token: async () => 'fresh' }, {}, fetchSpy);
  await http.request('/health');
  assert.equal(fetchSpy.calls[0].init.headers.Authorization, 'Bearer fresh');
});

test('defaultOrgId becomes X-Scope-OrgID', async () => {
  const fetchSpy = mockFetch(() => jsonOk({}));
  const http = new Http('http://q', 60000, {}, undefined, { defaultOrgId: 'tenant-a' }, fetchSpy);
  await http.request('/health');
  assert.equal(fetchSpy.calls[0].init.headers['X-Scope-OrgID'], 'tenant-a');
});

test('per-call orgId overrides defaultOrgId', async () => {
  const fetchSpy = mockFetch(() => jsonOk({}));
  const http = new Http('http://q', 60000, {}, undefined, { defaultOrgId: 'tenant-a' }, fetchSpy);
  await http.request('/health', { orgId: 'tenant-b' });
  assert.equal(fetchSpy.calls[0].init.headers['X-Scope-OrgID'], 'tenant-b');
});

test('per-call timeoutMs maps an AbortError to QrynTimeoutError', async () => {
  const fetchSpy = mockFetch(async (_url, init) => {
    await new Promise((resolve, reject) => {
      init.signal.addEventListener('abort', () => {
        const err = new Error('aborted');
        err.name = 'AbortError';
        reject(err);
      }, { once: true });
    });
  });
  const http = new Http('http://q', 60000, {}, undefined, {}, fetchSpy);
  await assert.rejects(
    () => http.request('/slow', { timeoutMs: 5 }),
    (err) => err instanceof QrynTimeoutError && typeof err.elapsedMs === 'number'
  );
});

test('caller AbortSignal maps to QrynAbortedError', async () => {
  const fetchSpy = mockFetch(async (_url, init) => {
    await new Promise((resolve, reject) => {
      init.signal.addEventListener('abort', () => {
        const err = new Error('aborted');
        err.name = 'AbortError';
        reject(err);
      }, { once: true });
    });
  });
  const http = new Http('http://q', 60000, {}, undefined, {}, fetchSpy);
  const ac = new AbortController();
  const reason = new Error('user-cancel');
  setTimeout(() => ac.abort(reason), 5);
  await assert.rejects(
    () => http.request('/slow', { signal: ac.signal, timeoutMs: 60000 }),
    (err) => err instanceof QrynAbortedError && err.reason === reason
  );
});

test('non-2xx still throws QrynError', async () => {
  const fetchSpy = mockFetch(() => new Response(JSON.stringify({ msg: 'bad' }), {
    status: 400,
    headers: { 'content-type': 'application/json' }
  }));
  const http = new Http('http://q', 60000, {}, undefined, {}, fetchSpy);
  await assert.rejects(
    () => http.request('/x'),
    (err) => err instanceof QrynError && err.statusCode === 400
  );
});
