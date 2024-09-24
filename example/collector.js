const { QrynClient, Metric, Stream, Collector } = require('../src');

async function main() {
  const client = new QrynClient({
    baseUrl: process.env['QYRN_WRITE_URL'],
    auth: {
      username: process.env['QYRN_LOGIN'],
      password: process.env['QRYN_PASSWORD']
    },
    timeout: 5000
  });

  const client2 = new QrynClient({
    baseUrl: process.env['QYRN_URL_BACKUP'],
    auth: {
      username: process.env['QYRN_LOGIN_BACKUP'],
      password: process.env['QRYN_PASSWORD_BACKUP']
    },
    timeout: 5000
  });

  // Create a Collector instance
  const collector = new Collector(client, {
    orgId: 5,
    maxBulkSize: 50,
    maxTimeout: 3000,
    async: true,
  });
  collector.once('error', (error) => {
      console.error(error);
  }).on('info', (info) => {
    console.info(info.isSuccess ,info.getHeaders, info.status, info.path);
  });

  // Create and add Loki streams to the Collector
  const stream1 = collector.createStream({ job: 'job1', env: 'prod' });
  stream1.addEntry(Date.now(), 'Log message 1');
  stream1.addEntry(Date.now(), 'Log message 2');
  
  const stream2 = collector.createStream({ job: 'job2', env: 'dev' });
  stream2.addEntry(Date.now(), 'Log message 3');

  // Create and add Prometheus metrics to the Collector
  const memoryUsed = collector.createMetric({ name: 'memory_use_test_134', labels: { foo: 'bar' } });
  memoryUsed.addSample(1024 * 1024 * 100);
  memoryUsed.addSample(105, Date.now() + 60000);

  const cpuUsed = collector.createMetric({name: 'cpu_test_1234', labels: { server: 'web-1' }});
  cpuUsed.addSample(105, Date.now() + 60000);
  
  // Add more samples to the metrics
  cpuUsed.addSample(106, Date.now() + 60000);
  memoryUsed.addSample(1024 * 1024 * 100);

}

main();