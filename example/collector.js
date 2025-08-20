const { GigapipeClient, Metric, Stream, Collector } = require('../src');

async function main() {
  console.log('Gigapipe Collector Example - Bulk Operations Demo');
  
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

  console.log(`Connecting to Gigapipe server: ${baseUrl}\n`);

  // Create a Collector instance with custom settings
  const collector = new Collector(client, {
    orgId: process.env['GIGAPIPE_ORG_ID'] || 'demo-org',
    maxBulkSize: 10, // Lower threshold for demo purposes
    maxTimeout: 2000, // 2 second timeout for demo
    async: true,
    retryAttempts: 3,
    retryDelay: 1000
  });

  // Set up event handlers
  let pushCount = 0;
  collector.on('error', (error) => {
    console.error('Collector error:', error.message);
  }).on('info', (response) => {
    pushCount++;
    console.log(`Push ${pushCount} successful:`, {
      statusCode: response?.status || response?.statusCode || 'unknown',
      path: response?.path || 'unknown',
      success: response?.isSuccess !== false
    });
  });

  console.log('Collector configured with:');
  console.log(`   - Max bulk size: 10 items`);
  console.log(`   - Max timeout: 2000ms`);
  console.log(`   - Organization ID: ${process.env['GIGAPIPE_ORG_ID'] || 'demo-org'}`);
  console.log(`   - Async mode: enabled\n`);

  // Create multiple streams for different services
  console.log('Creating log streams...');
  const apiStream = collector.createStream({ 
    job: 'api-server', 
    env: 'production',
    service: 'user-api'
  });
  
  const workerStream = collector.createStream({ 
    job: 'background-worker', 
    env: 'production',
    service: 'email-processor'
  });

  const dbStream = collector.createStream({
    job: 'database',
    env: 'production', 
    service: 'postgres'
  });

  // Add log entries to streams
  console.log('Adding log entries...');
  apiStream.addEntry(Date.now(), 'User authentication successful - user_id: 12345');
  apiStream.addEntry(Date.now(), 'API request processed in 45ms - endpoint: /api/users');
  
  workerStream.addEntry(Date.now(), 'Email queue processing started - batch_size: 100');
  workerStream.addEntry(Date.now(), 'Email sent successfully - recipient: user@example.com');
  
  dbStream.addEntry(Date.now(), 'Connection pool size increased to 20');
  dbStream.addEntry(Date.now(), 'Query executed successfully - duration: 12ms');

  // Create performance metrics
  console.log('Creating performance metrics...');
  const responseTimeMetric = collector.createMetric({ 
    name: 'http_request_duration_seconds', 
    labels: { 
      method: 'GET', 
      endpoint: '/api/users',
      status_code: '200'
    } 
  });
  
  const memoryMetric = collector.createMetric({
    name: 'process_memory_bytes',
    labels: { 
      process: 'api-server',
      instance: 'prod-01'
    }
  });

  const cpuMetric = collector.createMetric({
    name: 'process_cpu_percent',
    labels: { 
      process: 'worker',
      instance: 'prod-02' 
    }
  });

  // Add metric samples
  console.log('Adding metric samples...');
  responseTimeMetric.addSample(0.045, Date.now()); // 45ms response time
  responseTimeMetric.addSample(0.032, Date.now() + 1000); // 32ms response time
  
  memoryMetric.addSample(1024 * 1024 * 256, Date.now()); // 256MB memory usage
  memoryMetric.addSample(1024 * 1024 * 280, Date.now() + 1000); // 280MB memory usage
  
  cpuMetric.addSample(75.5, Date.now()); // 75.5% CPU usage
  cpuMetric.addSample(82.3, Date.now() + 1000); // 82.3% CPU usage

  console.log(`\nCurrent collector state:`);
  console.log(`   - Total items: ${collector.total}`);
  console.log(`   - Streams in cache: ${collector.streams.size}`);
  console.log(`   - Metrics in cache: ${collector.metrics.size}`);

  // Add more data to trigger bulk push
  console.log('\nAdding more data to trigger bulk push...');
  for (let i = 1; i <= 5; i++) {
    apiStream.addEntry(Date.now() + i * 100, `Bulk log entry ${i} - processing batch operations`);
    responseTimeMetric.addSample(0.050 + (i * 0.001), Date.now() + i * 100);
  }

  console.log('\nWaiting for automatic bulk push or timeout...');
  
  // Wait for bulk operations to complete
  await new Promise(resolve => {
    let timeoutId = setTimeout(() => {
      console.log('\nBulk push completed via timeout');
      resolve();
    }, 3000);

    const originalTotal = collector.total;
    const checkInterval = setInterval(() => {
      if (collector.total === 0 && originalTotal > 0) {
        clearTimeout(timeoutId);
        clearInterval(checkInterval);
        console.log('\nBulk push completed via size threshold');
        resolve();
      }
    }, 100);
  });

  console.log('\nFinal collector state:');
  console.log(`   - Total items: ${collector.total}`);
  console.log(`   - Total pushes: ${pushCount}`);
  console.log(`   - Streams in cache: ${collector.streams.size}`);
  console.log(`   - Metrics in cache: ${collector.metrics.size}`);

  console.log('\nCollector example completed successfully!');
  console.log('The collector automatically handled bulk operations, retries, and caching.');
}

main();