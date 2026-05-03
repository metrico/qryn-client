const { describe, it, afterEach } = require('node:test');
const assert = require('node:assert');
const { GigapipeClient } = require('../src/index');

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

function ok() { return new Response(JSON.stringify({}), { status: 200, headers: { 'content-type': 'application/json' } }); }

describe('GigapipeClient new options', () => {
  it('plumbs defaultOrgId to every request as X-Scope-OrgID', async () => {
    let observed;
    globalThis.fetch = async (url, init) => { observed = init.headers; return ok(); };
    const client = new GigapipeClient({ baseUrl: 'http://localhost', auth: { type: 'basic', username: 'u', password: 'p' }, defaultOrgId: 'tenant-z' });
    // tempo.search doesn't set its own X-Scope-OrgID until Task 12 — perfect to verify defaultOrgId fallback.
    await client.tempo.search('foo=bar');
    assert.equal(observed['X-Scope-OrgID'], 'tenant-z');
  });

  it('per-instance defaultOrgId is overridden by per-call orgId on Http', async () => {
    let observed;
    globalThis.fetch = async (url, init) => { observed = init.headers; return ok(); };
    const client = new GigapipeClient({ baseUrl: 'http://localhost', auth: { type: 'basic', username: 'u', password: 'p' }, defaultOrgId: 'tenant-z' });
    // Reach into Http to test the override directly.
    await client.tempo.service.request('/api/search?q=foo', { method: 'GET', orgId: 'tenant-a' });
    assert.equal(observed['X-Scope-OrgID'], 'tenant-a');
  });

  it('retry config flows from constructor as Http.defaultRetry', () => {
    const client = new GigapipeClient({ baseUrl: 'http://localhost', auth: { type: 'basic', username: 'u', password: 'p' }, retry: { attempts: 5, baseDelayMs: 10, maxDelayMs: 50 } });
    const http = client.tempo.service;
    assert.deepEqual(http.defaultRetry, { attempts: 5, baseDelayMs: 10, maxDelayMs: 50 });
  });

  it('omitting defaultOrgId does not set X-Scope-OrgID', async () => {
    let observed;
    globalThis.fetch = async (url, init) => { observed = init.headers; return ok(); };
    const client = new GigapipeClient({ baseUrl: 'http://localhost', auth: { type: 'basic', username: 'u', password: 'p' } });
    await client.tempo.search('foo=bar');
    assert.equal(observed['X-Scope-OrgID'], undefined);
  });
});
