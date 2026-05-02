const { QrynClient } = require('../src');

const baseUrl = process.env.QYRN_READ_URL;
const orgId   = process.env.QYRN_ORG_ID;

if (!baseUrl) {
  console.error('Set QYRN_READ_URL (and optionally QYRN_ORG_ID) to run this smoke.');
  process.exit(2);
}

(async () => {
  const client = new QrynClient({ baseUrl, defaultOrgId: orgId });
  const reader = client.loki.createReader();

  console.log('-- labels --');
  const labels = await reader.labels();
  console.log(labels.response);

  console.log('-- queryRange --');
  const end = new Date();
  const start = new Date(end.getTime() - 60 * 60 * 1000);
  const range = await reader.queryRange('{job=~".+"}', start, end, '60s', 5, 'backward');
  console.log(JSON.stringify(range.response, null, 2).slice(0, 500));
})().catch(err => {
  console.error(err);
  process.exit(1);
});
