const { QrynClient, Metric, Stream, Collector } = require('../src');

async function main() {
  const client = new QrynClient({
    baseUrl: process.env['QYRN_URL'],
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
    maxBulkSize: 2,
    maxTimeout: 3000
  });

  // Create and add Loki streams to the Collector
  // const stream1 = client.createStream({ job: 'job1', env: 'prod' });
  // stream1.addEntry(Date.now(), 'Log message 1');
  // stream1.addEntry(Date.now(), 'Log message 2');
  // collector.addStream(stream1);

  // const stream2 = new Stream({ job: 'job2', env: 'dev' });
  // stream2.addEntry(Date.now(), 'Log message 3');
  // collector.addStream(stream2);

  // Create and add Prometheus metrics to the Collector
  const memoryUsed = client.createMetric({ name: 'memory_use_test_134', labels: { foo: 'bar' } });
  memoryUsed.addSample(1024 * 1024 * 100);
  memoryUsed.addSample(105, Date.now() + 60000);
  collector.addMetric(memoryUsed);

  const cpuUsed = new Metric('cpu_test_1234', { server: 'web-1' });
  cpuUsed.addSample(1024 * 1024 * 100);
  collector.addMetric(cpuUsed);

  // Wait for the Collector to push the data
  await new Promise(resolve => setTimeout(resolve, 5000));

  // Add more samples to the metrics
  cpuUsed.addSample(105, Date.now() + 60000);
  memoryUsed.addSample(1024 * 1024 * 100);

  // Wait for the Collector to push the data again
  await new Promise(resolve => setTimeout(resolve, 5000));

  console.log('Data pushed successfully using the Collector');
}

main();