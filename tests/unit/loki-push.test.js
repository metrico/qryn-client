const { test } = require('node:test');
const assert = require('node:assert/strict');
const Http = require('../../src/services/http');
const Loki = require('../../src/clients/loki');
const Stream = require('../../src/models/stream');

function mockFetch() {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url: String(url), init });
    return new Response('', { status: 200 });
  };
  fn.calls = calls;
  return fn;
}

function makeStream() {
  const s = new Stream({ app: 'x' });
  s.addEntry(Date.now(), 'msg');
  return s;
}

test('Loki.push: per-call orgId overrides defaultOrgId', async () => {
  const fetchSpy = mockFetch();
  const http = new Http('http://q', 60000, {}, undefined, { defaultOrgId: 'A' }, fetchSpy);
  const loki = new Loki(http);
  const s = makeStream();
  await loki.push([s], { orgId: 'B' });
  assert.equal(fetchSpy.calls[0].init.headers['X-Scope-OrgID'], 'B');
});
