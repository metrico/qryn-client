const { QrynClient } = require('../src');

const baseUrl = process.env.QYRN_READ_URL;
const orgId   = process.env.QYRN_ORG_ID;

if (!baseUrl) {
  console.error('Set QYRN_READ_URL (and optionally QYRN_ORG_ID) to run this smoke.');
  process.exit(2);
}

(async () => {
  const client = new QrynClient({ baseUrl, defaultOrgId: orgId });

  console.log('-- searchTags --');
  const tags = await client.tempo.searchTags();
  console.log(tags.response);

  console.log('-- search --');
  const found = await client.tempo.search({ q: '{}', limit: 5 });
  console.log(JSON.stringify(found.response, null, 2).slice(0, 500));
})().catch(err => {
  console.error(err);
  process.exit(1);
});
