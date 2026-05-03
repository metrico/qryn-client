const { describe, it, afterEach } = require('node:test');
const assert = require('node:assert');
const { GigapipeClient } = require('../src/index');

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

function ok(body = {}) { return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } }); }

describe('Prometheus — opts plumbing', () => {
  it('reader.query forwards orgId', async () => {
    let observed;
    globalThis.fetch = async (url, init) => { observed = init.headers; return ok({}); };
    const client = new GigapipeClient({ baseUrl: 'http://localhost', auth: { type: 'basic', username: 'u', password: 'p' } });
    const reader = client.prom.createReader({});
    await reader.query('up', { orgId: 'tenant-a' });
    assert.equal(observed['X-Scope-OrgID'], 'tenant-a');
  });

  it('reader.queryRange forwards opts', async () => {
    let observed;
    globalThis.fetch = async (url, init) => { observed = init; return ok({}); };
    const client = new GigapipeClient({ baseUrl: 'http://localhost', auth: { type: 'basic', username: 'u', password: 'p' } });
    const reader = client.prom.createReader({});
    await reader.queryRange('up', 0, 1, '15s', { orgId: 'tenant-b', timeoutMs: 250 });
    assert.equal(observed.headers['X-Scope-OrgID'], 'tenant-b');
  });

  it('reader.labels/labelValues/series/rules accept opts', async () => {
    let observed;
    globalThis.fetch = async (url, init) => { observed = init.headers; return ok({}); };
    const client = new GigapipeClient({ baseUrl: 'http://localhost', auth: { type: 'basic', username: 'u', password: 'p' } });
    const reader = client.prom.createReader({});
    await reader.labels({ orgId: 't1' });        assert.equal(observed['X-Scope-OrgID'], 't1');
    await reader.labelValues('x', { orgId: 't2' }); assert.equal(observed['X-Scope-OrgID'], 't2');
    await reader.series(['{a="b"}'], 0, 1, { orgId: 't3' }); assert.equal(observed['X-Scope-OrgID'], 't3');
    await reader.rules({ orgId: 't4' });         assert.equal(observed['X-Scope-OrgID'], 't4');
  });

  it('per-call orgId on reader.query overrides createReader orgId', async () => {
    let observed;
    globalThis.fetch = async (url, init) => { observed = init.headers; return ok({}); };
    const client = new GigapipeClient({ baseUrl: 'http://localhost', auth: { type: 'basic', username: 'u', password: 'p' } });
    const reader = client.prom.createReader({ orgId: 'reader-default' });
    await reader.query('up'); // no per-call -> reader-default
    assert.equal(observed['X-Scope-OrgID'], 'reader-default');
    await reader.query('up', { orgId: 'override' });
    assert.equal(observed['X-Scope-OrgID'], 'override');
  });
});
