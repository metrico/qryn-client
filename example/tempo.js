/**
 * Runtime smoke for the Tempo client. Driven by env vars:
 *   GIGAPIPE_URL=http://localhost:3100 \
 *   GIGAPIPE_USER=user \
 *   GIGAPIPE_PASS=pass \
 *   GIGAPIPE_ORG=tenant-a \
 *   TEMPO_TRACE_ID=abc-123 \
 *   node example/tempo.js
 */
const { GigapipeClient } = require('../src');

(async () => {
  const client = new GigapipeClient({
    baseUrl: process.env.GIGAPIPE_URL || 'http://localhost:3100',
    auth: process.env.GIGAPIPE_USER
      ? { type: 'basic', username: process.env.GIGAPIPE_USER, password: process.env.GIGAPIPE_PASS }
      : undefined,
    defaultOrgId: process.env.GIGAPIPE_ORG
  });

  const tags = await client.tempo.searchTags('span');
  console.log('span tags:', tags.response);

  if (process.env.TEMPO_TRACE_ID) {
    const trace = await client.tempo.getTrace(process.env.TEMPO_TRACE_ID);
    console.log('trace:', JSON.stringify(trace.response, null, 2));
  }
})().catch(err => { console.error(err); process.exit(1); });
