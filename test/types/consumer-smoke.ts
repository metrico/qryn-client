import {
  GigapipeClient,
  GigapipeAbortedError,
  GigapipeTimeoutError,
  GigapipeError,
  GigapipeResponse,
  Stream,
  Metric
} from 'gigapipe-client';

async function smoke(): Promise<void> {
  const ctl = new AbortController();

  // Auth shapes
  const c1 = new GigapipeClient({
    baseUrl: 'http://localhost:3100',
    auth: { type: 'basic', username: 'u', password: 'p' },
    defaultOrgId: 'tenant-a',
    retry: { attempts: 5, baseDelayMs: 100, maxDelayMs: 2000 }
  });
  const c2 = new GigapipeClient({ auth: { type: 'bearer', token: async () => 'tok' } });
  const c3 = new GigapipeClient({ auth: { type: 'custom', headers: { 'X-Api-Key': 'abc' } } });
  const c4 = new GigapipeClient({ auth: { type: 'custom', headers: async () => ({ 'X-Api-Key': 'abc' }) } });
  const c5 = new GigapipeClient({}); // unauthenticated allowed

  // Loki write
  const stream: Stream = c1.createStream({ job: 'api' });
  await c1.loki.push([stream], { orgId: 'tenant-a', signal: ctl.signal, timeoutMs: 30_000 });

  // Loki read
  const reader = c1.loki.createReader({ orgId: 'tenant-a' });
  const r1: GigapipeResponse = await reader.query('{job="api"}', { limit: 100 }, { signal: ctl.signal });
  const r2 = await reader.queryRange('{job="api"}', '0', '1', { step: '1m' }, { timeoutMs: 60_000 });
  await reader.labels({}, { signal: ctl.signal });
  await reader.labelValues('job');
  await reader.series('{job="api"}');

  // Prometheus
  const metric: Metric = c1.createMetric({ name: 'http_requests' });
  await c1.prom.push([metric], { orgId: 'tenant-a' });
  await c1.prom.createReader({}).queryRange('up', 0, 1, '15s', { signal: ctl.signal });
  await c1.prom.createReader({}).rules({ orgId: 'tenant-a' });

  // Tempo
  await c1.tempo.search('q=foo', { signal: ctl.signal });
  await c1.tempo.searchTags('span');
  await c1.tempo.searchTagValues('service.name');
  await c1.tempo.getTrace('abc-123', { orgId: 'tenant-a' });

  // Errors
  try {
    await reader.query('{job="api"}', {}, { signal: ctl.signal });
  } catch (e) {
    if (e instanceof GigapipeAbortedError) console.error('aborted', e.reason);
    else if (e instanceof GigapipeTimeoutError) console.error('timeout', e.elapsedMs);
    else if (e instanceof GigapipeError) console.error('error', e.statusCode);
  }

  // Use the unused identifiers to keep --strict happy.
  void c2; void c3; void c4; void c5; void r1; void r2;
}

void smoke();
