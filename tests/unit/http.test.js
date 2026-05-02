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

test('retry: 503 retried up to attempts then fails', async () => {
  let calls = 0;
  const fetchSpy = mockFetch(() => {
    calls++;
    return new Response('boom', { status: 503 });
  });
  const http = new Http('http://q', 60000, {}, undefined, {
    retry: { attempts: 3, baseDelayMs: 1, maxDelayMs: 1 }
  }, fetchSpy);
  await assert.rejects(() => http.request('/x'));
  assert.equal(calls, 3);
});

test('retry: 200 returns immediately, no extra calls', async () => {
  let calls = 0;
  const fetchSpy = mockFetch(() => { calls++; return jsonOk({ ok: true }); });
  const http = new Http('http://q', 60000, {}, undefined, {
    retry: { attempts: 3, baseDelayMs: 1, maxDelayMs: 1 }
  }, fetchSpy);
  await http.request('/x');
  assert.equal(calls, 1);
});

test('retry: 400 not retried', async () => {
  let calls = 0;
  const fetchSpy = mockFetch(() => {
    calls++;
    return new Response(JSON.stringify({ err: 'bad' }), {
      status: 400,
      headers: { 'content-type': 'application/json' }
    });
  });
  const http = new Http('http://q', 60000, {}, undefined, {
    retry: { attempts: 3, baseDelayMs: 1, maxDelayMs: 1 }
  }, fetchSpy);
  await assert.rejects(() => http.request('/x'));
  assert.equal(calls, 1);
});

test('retry: 429 honors Retry-After header', async () => {
  let calls = 0;
  const fetchSpy = mockFetch(() => {
    calls++;
    if (calls === 1) {
      return new Response('limit', { status: 429, headers: { 'Retry-After': '0' } });
    }
    return jsonOk({ ok: true });
  });
  const http = new Http('http://q', 60000, {}, undefined, {
    retry: { attempts: 3, baseDelayMs: 5000, maxDelayMs: 5000 }
  }, fetchSpy);
  const t0 = Date.now();
  await http.request('/x');
  const elapsed = Date.now() - t0;
  // baseDelayMs=5000 would force a long wait; Retry-After:0 must short-circuit it.
  assert.ok(elapsed < 1000, `expected <1s, got ${elapsed}ms`);
  assert.equal(calls, 2);
});

test('retry: caller-aborted signal stops the loop', async () => {
  let calls = 0;
  const fetchSpy = mockFetch(async (_url, init) => {
    calls++;
    return new Response('boom', { status: 503 });
  });
  const http = new Http('http://q', 60000, {}, undefined, {
    retry: { attempts: 5, baseDelayMs: 50, maxDelayMs: 50 }
  }, fetchSpy);
  const ac = new AbortController();
  setTimeout(() => ac.abort(new Error('cancel')), 20);
  await assert.rejects(
    () => http.request('/x', { signal: ac.signal }),
    (err) => err instanceof QrynAbortedError
  );
  assert.ok(calls < 5, `expected loop to short-circuit, got ${calls} calls`);
});
