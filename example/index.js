const {QrynClient,Metric, Stream} = require('../src');

async function main() {
  try {
    const client = new QrynClient({
        baseUrl: process.env['QYRN_URL'],
        auth: {
          username: process.env['QYRN_LOGIN'],
          password: process.env['QRYN_PASSWORD']
        },
        timeout: 5000
    })
    // Create and push Loki streams
    const stream1 = client.createStream({ job: 'job1', env: 'prod' });
    stream1.addEntry(Date.now(), 'Log message 1');
    stream1.addEntry(Date.now(), 'Log message 2');

    const stream2 = new Stream({ job: 'job2', env: 'dev' });
    stream2.addEntry(Date.now(), 'Log message 3');

    const lokiResponse = await client.loki.push([stream1, stream2]);
    console.log('Loki push successful:', lokiResponse);

    // Create and push Prometheus metrics

    
    const memoryUsed = client.createMetric({ name: 'memory_use_test_134', labels: {
        foo:"bar"
    }});
    memoryUsed.addSample(1024 * 1024 * 100);
    memoryUsed.addSample(105, Date.now() + 60000);
    
    const cpuUsed = new Metric('cpu_test_1234',  { server: 'web-1' });
    
    cpuUsed.addSample(1024 * 1024 * 100);
    cpuUsed.addSample(105, Date.now() + 60000);
    
    const promResponse = await client.prom.push([memoryUsed, cpuUsed]);
    console.log('Prometheus push successful:', promResponse);

  } catch (error) {
    console.error('An error occurred:', error);
  }
}

main();