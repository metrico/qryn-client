const { test } = require('node:test');
const assert = require('node:assert/strict');
const Http = require('../../src/services/http');

function jsonOk(body) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' }
  });
}

function fetchCapture(impl) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url: String(url), init });
    return impl ? impl(url, init) : jsonOk({ status: 'success', data: {} });
  };
  fn.calls = calls;
  return fn;
}

function makeClient(fetchSpy) {
  const http = new Http('http://q', 60000, {}, undefined, {}, fetchSpy);
  const Loki = require('../../src/clients/loki');
  return new Loki(http).createReader({ orgId: 'tenant-a' });
}

test('query: GET /loki/api/v1/query with normalized time', async () => {
  const fetchSpy = fetchCapture();
  const reader = makeClient(fetchSpy);
  await reader.query('{job="x"} |= `boom`', new Date(1700000000000));
  const call = fetchSpy.calls[0];
  assert.match(call.url, /\/loki\/api\/v1\/query\?/);
  assert.match(call.url, /query=%7Bjob%3D%22x%22%7D/);
  assert.match(call.url, /time=1700000000000000000/);
  assert.equal(call.init.method, 'GET');
  assert.equal(call.init.headers['X-Scope-OrgID'], 'tenant-a');
});

test('queryRange: passes step, limit, direction', async () => {
  const fetchSpy = fetchCapture();
  const reader = makeClient(fetchSpy);
  await reader.queryRange('{job="x"}', 1700000000, 1700003600, '15s', 100, 'backward');
  const call = fetchSpy.calls[0];
  assert.match(call.url, /step=15s/);
  assert.match(call.url, /limit=100/);
  assert.match(call.url, /direction=backward/);
  assert.match(call.url, /start=1700000000000000000/);
  assert.match(call.url, /end=1700003600000000000/);
});

test('labels: omits start/end when not given', async () => {
  const fetchSpy = fetchCapture();
  const reader = makeClient(fetchSpy);
  await reader.labels();
  const call = fetchSpy.calls[0];
  assert.match(call.url, /\/loki\/api\/v1\/labels(\?|$)/);
  assert.doesNotMatch(call.url, /start=/);
  assert.doesNotMatch(call.url, /end=/);
});

test('labelValues: encodes label name', async () => {
  const fetchSpy = fetchCapture();
  const reader = makeClient(fetchSpy);
  await reader.labelValues('job');
  assert.match(fetchSpy.calls[0].url, /\/loki\/api\/v1\/label\/job\/values/);
});

test('series: repeated match[] params', async () => {
  const fetchSpy = fetchCapture();
  const reader = makeClient(fetchSpy);
  await reader.series(['{a="1"}', '{b="2"}'], 1700000000, 1700003600);
  const call = fetchSpy.calls[0];
  // URLSearchParams encodes both as repeated match%5B%5D=
  assert.match(call.url, /match%5B%5D=%7Ba%3D%221%22%7D/);
  assert.match(call.url, /match%5B%5D=%7Bb%3D%222%22%7D/);
});

test('per-call opts.orgId overrides reader-level orgId', async () => {
  const fetchSpy = fetchCapture();
  const reader = makeClient(fetchSpy);
  await reader.labels(undefined, undefined, { orgId: 'tenant-b' });
  assert.equal(fetchSpy.calls[0].init.headers['X-Scope-OrgID'], 'tenant-b');
});
