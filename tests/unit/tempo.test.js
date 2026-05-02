const { test } = require('node:test');
const assert = require('node:assert/strict');
const Http = require('../../src/services/http');
const TempoClient = require('../../src/clients/tempo');

function jsonOk(body) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' }
  });
}

function fetchCapture() {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url: String(url), init });
    return jsonOk({ traces: [] });
  };
  fn.calls = calls;
  return fn;
}

function client(fetchSpy) {
  const http = new Http('http://q', 60000, {}, undefined, {}, fetchSpy);
  return new TempoClient(http);
}

test('searchTags: scope query param', async () => {
  const fetchSpy = fetchCapture();
  const t = client(fetchSpy);
  await t.searchTags('span');
  assert.match(fetchSpy.calls[0].url, /\/api\/search\/tags\?scope=span$/);
});

test('searchTags: scope omitted when not given', async () => {
  const fetchSpy = fetchCapture();
  const t = client(fetchSpy);
  await t.searchTags();
  assert.match(fetchSpy.calls[0].url, /\/api\/search\/tags(\?)?$/);
});

test('searchTagValues: v1 path encodes tag', async () => {
  const fetchSpy = fetchCapture();
  const t = client(fetchSpy);
  await t.searchTagValues('service.name');
  assert.match(fetchSpy.calls[0].url, /\/api\/search\/tag\/service\.name\/values/);
});

test('getTrace: aliases getTraceSpansJson path', async () => {
  const fetchSpy = fetchCapture();
  const t = client(fetchSpy);
  await t.getTrace('abc123');
  assert.match(fetchSpy.calls[0].url, /\/api\/traces\/abc123\/json/);
});

test('search: SearchOpts object becomes query string with q', async () => {
  const fetchSpy = fetchCapture();
  const t = client(fetchSpy);
  await t.search({ q: '{ duration > 1s }', limit: 5, spss: 10 });
  const url = fetchSpy.calls[0].url;
  assert.match(url, /q=%7B\+duration\+%3E\+1s\+%7D/);
  assert.match(url, /limit=5/);
  assert.match(url, /spss=10/);
});

test('search: string input preserved (back-compat)', async () => {
  const fetchSpy = fetchCapture();
  const t = client(fetchSpy);
  await t.search('q=foo');
  assert.match(fetchSpy.calls[0].url, /\/api\/search\?q=foo$/);
});

test('opts.orgId sets X-Scope-OrgID', async () => {
  const fetchSpy = fetchCapture();
  const t = client(fetchSpy);
  await t.searchTags('span', { orgId: 'tenant-a' });
  assert.equal(fetchSpy.calls[0].init.headers['X-Scope-OrgID'], 'tenant-a');
});
