const { GigapipeClient, Metric, Stream } = require('../src');

async function main() {
    const baseUrl = process.env['GIGAPIPE_WRITE_URL'] ? 
        `http://${process.env['GIGAPIPE_WRITE_URL']}:3100` : 
        'http://localhost:3100';
        
    const client = new GigapipeClient({
        baseUrl: baseUrl,
        auth: {
          username: process.env['GIGAPIPE_LOGIN'] || 'your-username',
          password: process.env['GIGAPIPE_PASSWORD'] || 'your-password'
        },
        timeout: 5000
    });
    
    const backupUrl = process.env['GIGAPIPE_URL_BACKUP'] ? 
        `http://${process.env['GIGAPIPE_URL_BACKUP']}:3100` : 
        'http://localhost:3101';
        
    const client2 = new GigapipeClient({
      baseUrl: backupUrl,
      auth: {
        username: process.env['GIGAPIPE_LOGIN_BACKUP'] || process.env['GIGAPIPE_LOGIN'] || 'your-username',
        password: process.env['GIGAPIPE_PASSWORD_BACKUP'] || process.env['GIGAPIPE_PASSWORD'] || 'your-password'
      },
      timeout: 5000
    });
    
    console.log(`Primary server: ${baseUrl}`);
    console.log(`Backup server: ${backupUrl}`);
    // Create and push Loki streams
    const stream1 = client.createStream({ job: 'job1', env: 'prod' });
    stream1.addEntry(Date.now(), 'Log message 1');
    stream1.addEntry(Date.now(), 'Log message 2');

    const stream2 = new Stream({ job: 'job2', env: 'dev' });
    stream2.addEntry(Date.now(), 'Log message 3');

    const lokiResponse = await client.loki.push([stream1, stream2]).catch(error => {
        console.log(error)
        return client2.loki.push([stream1, stream2]);
    });
    console.log('Loki push successful:', lokiResponse);

    // Create and push Prometheus metrics

    
    const memoryUsed = client.createMetric({ name: 'memory_use_test_134', labels: {
        foo:"bar"
    }});
    memoryUsed.addSample(1024 * 1024 * 100);
    memoryUsed.addSample(105, Date.now() + 60000);
    
    const cpuUsed = new Metric('cpu_test_1234',  { server: 'web-1' });
    
    cpuUsed.addSample(1024 * 1024 * 100);
    client.prom.push([memoryUsed, cpuUsed]).catch(error => {
      console.error(error);
      return client2.prom.push([memoryUsed, cpuUsed]);
    });
    cpuUsed.addSample(105, Date.now() + 60000);
    memoryUsed.addSample(1024 * 1024 * 100);
    
    const promResponse = await client.prom.push([memoryUsed, cpuUsed]).catch(error => {
      console.error(error);
      return client2.prom.push([memoryUsed, cpuUsed]);
    });
    console.log('Prometheus push successful:', promResponse);
}

main();