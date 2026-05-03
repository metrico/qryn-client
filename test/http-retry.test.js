const { describe, it, afterEach, mock } = require('node:test');
const assert = require('node:assert');
const Http = require('../src/services/http');
const { GigapipeError, GigapipeAbortedError } = require('../src/types');

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

function jsonResponse(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
}

describe('Http.request — retry loop', () => {
  it('retries on 503 then succeeds within attempts budget', async () => {
    let n = 0;
    globalThis.fetch = async () => {
      n++;
      if (n < 3) return new Response('busy', { status: 503 });
      return jsonResponse({ ok: true });
    };
    const restore = mock.method(Math, 'random', () => 0);
    try {
      const http = new Http('http://localhost', 5000, {}, { username: 'u', password: 'p' });
      const out = await http.request('/x', { method: 'GET', retry: { attempts: 3, baseDelayMs: 1, maxDelayMs: 1 } });
      assert.equal(out.status, 200);
      assert.equal(n, 3);
    } finally { restore.mock.restore(); }
  });

  it('does not retry on 400', async () => {
    let n = 0;
    globalThis.fetch = async () => { n++; return new Response('nope', { status: 400 }); };
    const http = new Http('http://localhost', 5000, {}, { username: 'u', password: 'p' });
    await assert.rejects(
      http.request('/x', { method: 'GET', retry: { attempts: 3, baseDelayMs: 1, maxDelayMs: 1 } }),
      (err) => err instanceof GigapipeError && err.statusCode === 400
    );
    assert.equal(n, 1);
  });

  it('honors Retry-After (delta-seconds) on 429', async () => {
    let n = 0;
    const times = [];
    globalThis.fetch = async () => {
      times.push(Date.now()); n++;
      if (n === 1) return new Response('slow', { status: 429, headers: { 'retry-after': '0' } });
      return jsonResponse({ ok: true });
    };
    const http = new Http('http://localhost', 5000, {}, { username: 'u', password: 'p' });
    const out = await http.request('/x', { method: 'GET', retry: { attempts: 3, baseDelayMs: 999_999, maxDelayMs: 999_999 } });
    assert.equal(out.status, 200);
    assert.ok(times[1] - times[0] < 500, 'should have used Retry-After=0, not the configured backoff');
  });

  it('aborts the chain immediately on caller signal', async () => {
    let n = 0;
    globalThis.fetch = async (url, init) => {
      n++;
      if (init.signal.aborted) {
        const err = new Error('aborted'); err.name = 'AbortError'; throw err;
      }
      return new Response('busy', { status: 503 });
    };
    const restore = mock.method(Math, 'random', () => 0);
    try {
      const http = new Http('http://localhost', 5000, {}, { username: 'u', password: 'p' });
      const ctl = new AbortController();
      const p = http.request('/x', { method: 'GET', signal: ctl.signal, retry: { attempts: 5, baseDelayMs: 50, maxDelayMs: 50 } });
      setTimeout(() => ctl.abort('cancel'), 10);
      await assert.rejects(p, (err) => err instanceof GigapipeAbortedError);
      assert.ok(n < 5, 'should not exhaust retry budget after caller abort');
    } finally { restore.mock.restore(); }
  });

  it('uses instance default retry options when opts.retry is omitted', async () => {
    let n = 0;
    globalThis.fetch = async () => { n++; return n < 2 ? new Response('busy', { status: 503 }) : jsonResponse({ ok: true }); };
    const restore = mock.method(Math, 'random', () => 0);
    try {
      const http = new Http('http://localhost', 5000, {}, { username: 'u', password: 'p' });
      http.defaultRetry = { attempts: 3, baseDelayMs: 1, maxDelayMs: 1 };
      const out = await http.request('/x', { method: 'GET' });
      assert.equal(out.status, 200);
      assert.equal(n, 2);
    } finally { restore.mock.restore(); }
  });

  it('attempts: 1 means no retries', async () => {
    let n = 0;
    globalThis.fetch = async () => { n++; return new Response('busy', { status: 503 }); };
    const http = new Http('http://localhost', 5000, {}, { username: 'u', password: 'p' });
    await assert.rejects(
      http.request('/x', { method: 'GET', retry: { attempts: 1 } }),
      (err) => err instanceof GigapipeError && err.statusCode === 503
    );
    assert.equal(n, 1);
  });
});
