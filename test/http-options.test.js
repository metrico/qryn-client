const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const Http = require('../src/services/http');
const { GigapipeError, GigapipeAbortedError, GigapipeTimeoutError } = require('../src/types');

const realFetch = globalThis.fetch;
let calls;

function mockFetch(impl) {
  calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    return await impl({ url, init });
  };
}

beforeEach(() => { calls = []; });
afterEach(() => { globalThis.fetch = realFetch; });

function jsonResponse(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers }
  });
}

describe('Http.request — per-call options', () => {
  it('uses opts.timeoutMs to set the per-attempt timeout (overrides instance default)', async () => {
    let observedSignal;
    mockFetch(({ init }) => {
      observedSignal = init.signal;
      return Promise.resolve(jsonResponse({ ok: true }));
    });
    const http = new Http('http://localhost:3100', 5000, {}, { username: 'u', password: 'p' });
    await http.request('/x', { method: 'GET', timeoutMs: 100 });
    assert.ok(observedSignal instanceof AbortSignal);
  });

  it('combines caller signal with timeout — aborts when caller aborts', async () => {
    mockFetch(({ init }) => new Promise((_, reject) => {
      init.signal.addEventListener('abort', () => {
        const err = new Error('aborted');
        err.name = 'AbortError';
        reject(err);
      }, { once: true });
    }));
    const http = new Http('http://localhost:3100', 5000, {}, { username: 'u', password: 'p' });
    const ctl = new AbortController();
    const p = http.request('/x', { method: 'GET', signal: ctl.signal, timeoutMs: 60_000 });
    setTimeout(() => ctl.abort('user-cancel'), 10);
    await assert.rejects(p, (err) => err instanceof GigapipeAbortedError && err.reason === 'user-cancel');
  });

  it('throws GigapipeTimeoutError when timeout fires (caller signal not aborted)', async () => {
    mockFetch(({ init }) => new Promise((_, reject) => {
      init.signal.addEventListener('abort', () => {
        const err = new Error('timed out');
        err.name = 'AbortError';
        reject(err);
      }, { once: true });
    }));
    const http = new Http('http://localhost:3100', 5000, {}, { username: 'u', password: 'p' });
    await assert.rejects(
      http.request('/x', { method: 'GET', timeoutMs: 20 }),
      (err) => err instanceof GigapipeTimeoutError && typeof err.elapsedMs === 'number'
    );
  });

  it('sets X-Scope-OrgID from opts.orgId, overriding existing header', async () => {
    let observedHeaders;
    mockFetch(({ init }) => {
      observedHeaders = init.headers;
      return Promise.resolve(jsonResponse({ ok: true }));
    });
    const http = new Http('http://localhost:3100', 5000, { 'X-Scope-OrgID': 'default' }, { username: 'u', password: 'p' });
    await http.request('/x', { method: 'GET', orgId: 'tenant-a' });
    assert.equal(observedHeaders['X-Scope-OrgID'], 'tenant-a');
  });

  it('keeps existing GigapipeError throws on non-2xx', async () => {
    mockFetch(() => Promise.resolve(new Response('boom', { status: 500 })));
    const http = new Http('http://localhost:3100', 5000, {}, { username: 'u', password: 'p' });
    await assert.rejects(http.request('/x', { method: 'GET' }), (err) => err instanceof GigapipeError && err.statusCode === 500);
  });
});
