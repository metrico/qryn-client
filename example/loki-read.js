/**
 * Runtime smoke for the Loki reader. Driven by env vars:
 *   GIGAPIPE_URL=http://localhost:3100 \
 *   GIGAPIPE_USER=user \
 *   GIGAPIPE_PASS=pass \
 *   GIGAPIPE_ORG=tenant-a \
 *   node example/loki-read.js
 */
const { GigapipeClient } = require('../src');

(async () => {
  const baseUrl = process.env.GIGAPIPE_URL || 'http://localhost:3100';
  const auth = process.env.GIGAPIPE_USER
    ? { type: 'basic', username: process.env.GIGAPIPE_USER, password: process.env.GIGAPIPE_PASS }
    : undefined;
  const orgId = process.env.GIGAPIPE_ORG;

  const client = new GigapipeClient({ baseUrl, auth, defaultOrgId: orgId, timeout: 30_000 });
  const reader = client.loki.createReader({});

  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort('demo-timeout'), 25_000);
  try {
    const labels = await reader.labels({}, { signal: ctl.signal });
    console.log('labels:', JSON.stringify(labels.response?.data?.slice?.(0, 10) ?? labels.response, null, 2));

    const end = String(Date.now() * 1_000_000);
    const start = String((Date.now() - 5 * 60 * 1000) * 1_000_000);
    const range = await reader.queryRange('{job=~".+"}', start, end, { limit: 5 }, { signal: ctl.signal });
    console.log('range[0..1]:', JSON.stringify(range.response?.data?.result?.slice?.(0, 1), null, 2));
  } finally {
    clearTimeout(timer);
  }
})().catch(err => { console.error(err); process.exit(1); });
