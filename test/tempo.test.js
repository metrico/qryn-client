const { describe, it, afterEach } = require('node:test');
const assert = require('node:assert');
const { GigapipeClient } = require('../src/index');

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

function ok(body = {}) { return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } }); }

describe('TempoClient v1.1', () => {
  it('search forwards opts.orgId', async () => {
    let observed;
    globalThis.fetch = async (url, init) => { observed = init.headers; return ok({}); };
    const client = new GigapipeClient({ baseUrl: 'http://localhost', auth: { type: 'basic', username: 'u', password: 'p' } });
    await client.tempo.search('foo=bar', { orgId: 'tenant-x' });
    assert.equal(observed['X-Scope-OrgID'], 'tenant-x');
  });

  it('searchTags hits /api/search/tags with optional scope', async () => {
    const urls = [];
    globalThis.fetch = async (url) => { urls.push(url); return ok({ tagNames: [] }); };
    const client = new GigapipeClient({ baseUrl: 'http://localhost', auth: { type: 'basic', username: 'u', password: 'p' } });
    await client.tempo.searchTags();
    assert.ok(urls[0].endsWith('/api/search/tags'), `got ${urls[0]}`);
    await client.tempo.searchTags('span');
    assert.ok(urls[1].includes('/api/search/tags?scope=span'), `got ${urls[1]}`);
  });

  it('searchTagValues hits /api/search/tag/{tag}/values', async () => {
    let observedUrl;
    globalThis.fetch = async (url) => { observedUrl = url; return ok({ tagValues: [] }); };
    const client = new GigapipeClient({ baseUrl: 'http://localhost', auth: { type: 'basic', username: 'u', password: 'p' } });
    await client.tempo.searchTagValues('service.name');
    assert.ok(observedUrl.endsWith('/api/search/tag/service.name/values'), `got ${observedUrl}`);
  });

  it('getTrace is an alias on /api/traces/{id}', async () => {
    let observedUrl;
    globalThis.fetch = async (url) => { observedUrl = url; return ok({ batches: [] }); };
    const client = new GigapipeClient({ baseUrl: 'http://localhost', auth: { type: 'basic', username: 'u', password: 'p' } });
    await client.tempo.getTrace('abc-123');
    assert.ok(observedUrl.endsWith('/api/traces/abc-123'), `got ${observedUrl}`);
  });

  it('getTrace forwards opts.orgId', async () => {
    let observed;
    globalThis.fetch = async (url, init) => { observed = init.headers; return ok({}); };
    const client = new GigapipeClient({ baseUrl: 'http://localhost', auth: { type: 'basic', username: 'u', password: 'p' } });
    await client.tempo.getTrace('abc-123', { orgId: 'tenant-q' });
    assert.equal(observed['X-Scope-OrgID'], 'tenant-q');
  });

  it('searchTagValuesV2 still works (back-compat)', async () => {
    let observedUrl;
    globalThis.fetch = async (url) => { observedUrl = url; return ok({}); };
    const client = new GigapipeClient({ baseUrl: 'http://localhost', auth: { type: 'basic', username: 'u', password: 'p' } });
    await client.tempo.searchTagValuesV2('http.status_code', 'q=foo');
    assert.ok(observedUrl.includes('/api/v2/search/tag/http.status_code/values?q=foo'), `got ${observedUrl}`);
  });

  it('getTraceSpansJson still works (back-compat)', async () => {
    let observedUrl;
    globalThis.fetch = async (url) => { observedUrl = url; return ok({}); };
    const client = new GigapipeClient({ baseUrl: 'http://localhost', auth: { type: 'basic', username: 'u', password: 'p' } });
    await client.tempo.getTraceSpansJson('abc-123');
    assert.ok(observedUrl.endsWith('/api/traces/abc-123/json'), `got ${observedUrl}`);
  });

  it('search accepts URLSearchParams', async () => {
    let observedUrl;
    globalThis.fetch = async (url) => { observedUrl = url; return ok({}); };
    const client = new GigapipeClient({ baseUrl: 'http://localhost', auth: { type: 'basic', username: 'u', password: 'p' } });
    const params = new URLSearchParams({ q: '{}' });
    await client.tempo.search(params);
    assert.ok(observedUrl.includes('/api/search?q=%7B%7D'), `got ${observedUrl}`);
  });
});
