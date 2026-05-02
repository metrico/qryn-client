import {
  QrynClient,
  QrynError,
  QrynAbortedError,
  QrynTimeoutError,
  type QrynAuth,
  type RetryOptions,
  type ReadOpts,
  type SearchOpts,
} from 'qryn-client';

// 1. Constructor with each auth shape.
const basic = new QrynClient({
  baseUrl: 'http://localhost:3100',
  auth: { type: 'basic', username: 'u', password: 'p' },
});

const bearer = new QrynClient({
  baseUrl: 'http://x',
  auth: { type: 'bearer', token: async () => 'tok' },
});

const custom = new QrynClient({
  baseUrl: 'http://x',
  auth: { type: 'custom', headers: { 'X-Api-Key': 'k' } },
});

// 2. Legacy shape still compiles (deprecated at runtime).
const legacy = new QrynClient({
  baseUrl: 'http://x',
  auth: { username: 'u', password: 'p' },
});

// 3. RetryOptions + defaultOrgId.
const retry: RetryOptions = { attempts: 3, baseDelayMs: 200, maxDelayMs: 5000 };
const withRetry = new QrynClient({
  baseUrl: 'http://x',
  retry,
  defaultOrgId: 'tenant-a',
});

// 4. Loki reader.
async function lokiSmoke() {
  const reader = basic.loki.createReader({ orgId: 'tenant-a' });
  const opts: ReadOpts = { timeoutMs: 30_000, retry };
  const inst = await reader.query('{job="x"}', new Date(), opts);
  inst.response.data.resultType;

  const range = await reader.queryRange(
    '{job="x"}',
    new Date(Date.now() - 3600_000),
    new Date(),
    '15s',
    100,
    'backward',
    opts
  );
  range.response.data.result;

  const labels = await reader.labels(undefined, undefined, opts);
  labels.response.data;

  await reader.labelValues('job', undefined, undefined, undefined, opts);
  await reader.series(['{a="1"}'], undefined, undefined, opts);
}

// 5. Tempo.
async function tempoSmoke() {
  const t = basic.tempo;
  const search: SearchOpts = { q: '{ duration > 1s }', limit: 5 };
  await t.search(search, { signal: new AbortController().signal });
  await t.searchTags('span');
  await t.searchTagValues('service.name');
  await t.getTrace('abc');
}

// 6. Errors are catchable as classes.
async function errorSmoke() {
  try {
    await basic.tempo.search({ q: 'x' });
  } catch (e) {
    if (e instanceof QrynAbortedError) e.reason;
    if (e instanceof QrynTimeoutError) e.elapsedMs;
    if (e instanceof QrynError) e.statusCode;
  }
}

void [basic, bearer, custom, legacy, withRetry, lokiSmoke, tempoSmoke, errorSmoke];
