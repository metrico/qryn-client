const { GigapipeClient } = require('../src');

async function quickstart() {
  console.log('Gigapipe Client Quickstart Example');
  
  // Create a Gigapipe client using .env values
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
  
  console.log(`Connecting to: ${baseUrl}`);

  console.log('GigapipeClient initialized');

  // Example 1: Push logs using streams
  console.log('\nExample 1: Pushing logs to Loki');
  const logStream = client.createStream({ 
    job: 'quickstart-example', 
    env: 'development' 
  });
  
  logStream.addEntry(Date.now(), 'Hello from Gigapipe!');
  logStream.addEntry(Date.now(), 'This is a sample log message');
  
  try {
    const response = await client.loki.push([logStream]);
    console.log('Logs pushed successfully:', response.statusCode);
  } catch (error) {
    console.log('Failed to push logs:', error.message);
    console.log('Check your GIGAPIPE_WRITE_URL and credentials in .env');
  }

  // Example 2: Push metrics
  console.log('\nExample 2: Pushing metrics to Prometheus');
  const cpuMetric = client.createMetric({
    name: 'cpu_usage_percent',
    labels: { 
      instance: 'quickstart-example',
      region: 'us-east-1' 
    }
  });
  
  cpuMetric.addSample(75.5, Date.now());
  cpuMetric.addSample(80.2, Date.now() + 1000);
  
  try {
    const response = await client.prom.push([cpuMetric]);
    console.log('Metrics pushed successfully:', response.statusCode);
  } catch (error) {
    console.log('Failed to push metrics:', error.message);
    console.log('Check your GIGAPIPE_WRITE_URL and credentials in .env');
  }

  // Example 3: Using the Collector for bulk operations
  console.log('\nExample 3: Using Collector for bulk operations');
  const collector = client.createCollector({
    maxBulkSize: 100,
    maxTimeout: 5000
  });

  collector.on('info', (response) => {
    console.log('Bulk push successful:', response.statusCode);
  });

  collector.on('error', (error) => {
    console.log('Push error:', error.message);
  });

  // Add multiple streams and metrics to the collector
  const stream1 = collector.createStream({ service: 'api', level: 'info' });
  const stream2 = collector.createStream({ service: 'worker', level: 'warn' });
  
  stream1.addEntry(Date.now(), 'API request processed');
  stream2.addEntry(Date.now(), 'Worker task completed with warnings');

  const memoryMetric = collector.createMetric({
    name: 'memory_usage_bytes',
    labels: { process: 'quickstart' }
  });
  memoryMetric.addSample(1024 * 1024 * 64); // 64MB

  console.log('Collector configured with streams and metrics');
  console.log('Collector would automatically push when thresholds are met');

  console.log('\nQuickstart example completed!');
  console.log('Check the other example files for more advanced usage patterns.');
}

quickstart().catch(console.error);