const { describe, it, afterEach } = require('node:test');
const assert = require('node:assert');
const { GigapipeClient } = require('../src/index');

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

function ok(body = {}) { return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } }); }

describe('Loki — opts plumbing', () => {
  it('reader.query passes orgId and forwards signal', async () => {
    let observed;
    globalThis.fetch = async (url, init) => { observed = { url, headers: init.headers, signal: init.signal }; return ok({ status: 'success' }); };
    const client = new GigapipeClient({ baseUrl: 'http://localhost', auth: { type: 'basic', username: 'u', password: 'p' } });
    const reader = client.loki.createReader({});
    const ctl = new AbortController();
    await reader.query('{job="x"}', {}, { signal: ctl.signal, orgId: 'tenant-a' });
    assert.equal(observed.headers['X-Scope-OrgID'], 'tenant-a');
    assert.ok(observed.signal instanceof AbortSignal);
  });

  it('reader.queryRange respects opts.timeoutMs', async () => {
    let observed;
    globalThis.fetch = async (url, init) => { observed = init; return ok({ status: 'success' }); };
    const client = new GigapipeClient({ baseUrl: 'http://localhost', auth: { type: 'basic', username: 'u', password: 'p' } });
    const reader = client.loki.createReader({ orgId: 'tenant-r' });
    await reader.queryRange('{job="x"}', '0', '1', { limit: 10 }, { timeoutMs: 100 });
    assert.ok(observed.signal instanceof AbortSignal);
  });

  it('push accepts opts.signal and orgId', async () => {
    let observed;
    globalThis.fetch = async (url, init) => { observed = init; return ok({ status: 'success' }); };
    const client = new GigapipeClient({ baseUrl: 'http://localhost', auth: { type: 'basic', username: 'u', password: 'p' } });
    const stream = client.createStream({ job: 'x' });
    stream.addEntry(Date.now(), 'hello');
    const ctl = new AbortController();
    await client.loki.push([stream], { orgId: 'tenant-z', signal: ctl.signal });
    assert.equal(observed.headers['X-Scope-OrgID'], 'tenant-z');
  });

  it('reader.labels supports opts (orgId)', async () => {
    let observed;
    globalThis.fetch = async (url, init) => { observed = init; return ok({ data: [] }); };
    const client = new GigapipeClient({ baseUrl: 'http://localhost', auth: { type: 'basic', username: 'u', password: 'p' } });
    const reader = client.loki.createReader({});
    await reader.labels({}, { orgId: 'tenant-a' });
    assert.equal(observed.headers['X-Scope-OrgID'], 'tenant-a');
  });

  it('reader.labelValues supports opts', async () => {
    let observed;
    globalThis.fetch = async (url, init) => { observed = init; return ok({ data: [] }); };
    const client = new GigapipeClient({ baseUrl: 'http://localhost', auth: { type: 'basic', username: 'u', password: 'p' } });
    const reader = client.loki.createReader({});
    await reader.labelValues('job', {}, { orgId: 'tenant-b' });
    assert.equal(observed.headers['X-Scope-OrgID'], 'tenant-b');
  });

  it('reader.series supports opts', async () => {
    let observed;
    globalThis.fetch = async (url, init) => { observed = init; return ok({ data: [] }); };
    const client = new GigapipeClient({ baseUrl: 'http://localhost', auth: { type: 'basic', username: 'u', password: 'p' } });
    const reader = client.loki.createReader({});
    await reader.series('{job="x"}', {}, { orgId: 'tenant-c' });
    assert.equal(observed.headers['X-Scope-OrgID'], 'tenant-c');
  });

  it('reader.query still honors queryOptions.parse and returns parsed logs', async () => {
    globalThis.fetch = async () => ok({
      status: 'success',
      data: {
        resultType: 'streams',
        result: [
          {
            stream: { job: 'x' },
            values: [['1700000000000000000', 'hello']]
          }
        ]
      }
    });
    const client = new GigapipeClient({ baseUrl: 'http://localhost', auth: { type: 'basic', username: 'u', password: 'p' } });
    const reader = client.loki.createReader({});
    const logs = await reader.query('{job="x"}', { parse: true });
    assert.ok(Array.isArray(logs));
    assert.equal(logs.length, 1);
    assert.equal(logs[0].message, 'hello');
  });
});
