const { describe, it } = require('node:test');
const assert = require('node:assert');
const { GigapipeClient } = require('../src/index.js');
const Collector = require('../src/utils/collector.js');
const Stream = require('../src/models/stream.js');
const Metric = require('../src/models/metric.js');

describe('Collector', () => {
  let mockClient;

  // Mock GigapipeClient for testing
  function createMockClient() {
    return {
      loki: {
        push: async (streams, options) => {
          // Mock successful push
          streams.forEach(s => s.confirm());
          return { statusCode: 200 };
        }
      },
      prom: {
        push: async (metrics, options) => {
          // Mock successful push
          metrics.forEach(m => m.confirm());
          return { statusCode: 200 };
        }
      }
    };
  }

  describe('Constructor', () => {
    it('should create Collector with default options', () => {
      const client = createMockClient();
      const collector = new Collector(client);
      
      assert.ok(collector);
      assert.equal(collector.maxBulkSize, 1000);
      assert.equal(collector.maxTimeout, 5000);
      assert.equal(collector.retryAttempts, 3);
      assert.equal(collector.retryDelay, 1000);
      assert.ok(collector.streams);
      assert.ok(collector.metrics);
    });

    it('should create Collector with custom options', () => {
      const client = createMockClient();
      const collector = new Collector(client, {
        maxBulkSize: 500,
        maxTimeout: 3000,
        orgId: 'test-org',
        retryAttempts: 5,
        retryDelay: 2000,
        async: true,
        fpLimit: 1000,
        ttlDays: 30
      });
      
      assert.equal(collector.maxBulkSize, 500);
      assert.equal(collector.maxTimeout, 3000);
      assert.equal(collector.orgId, 'test-org');
      assert.equal(collector.retryAttempts, 5);
      assert.equal(collector.retryDelay, 2000);
      assert.equal(collector.async, true);
      assert.equal(collector.fpLimit, 1000);
      assert.equal(collector.ttlDays, 30);
    });

    it('should initialize cache with custom options', () => {
      const client = createMockClient();
      const collector = new Collector(client, {
        cache: {
          max: 100,
          ttl: 30000,
          updateAgeOnGet: false
        }
      });
      
      assert.ok(collector.streams);
      assert.ok(collector.metrics);
    });
  });

  describe('createStream', () => {
    it('should create and cache new stream', () => {
      const client = createMockClient();
      const collector = new Collector(client);
      
      const stream = collector.createStream({ job: 'test', instance: 'localhost' });
      
      assert.ok(stream instanceof Stream);
      assert.equal(collector.streams.size, 1);
      assert.ok(collector.streams.has(stream.key));
    });

    it('should return existing stream if same labels', () => {
      const client = createMockClient();
      const collector = new Collector(client);
      
      const stream1 = collector.createStream({ job: 'test', instance: 'localhost' });
      const stream2 = collector.createStream({ job: 'test', instance: 'localhost' });
      
      assert.equal(stream1, stream2);
      assert.equal(collector.streams.size, 1);
    });

    it('should create different streams for different labels', () => {
      const client = createMockClient();
      const collector = new Collector(client);
      
      const stream1 = collector.createStream({ job: 'test', instance: 'localhost' });
      const stream2 = collector.createStream({ job: 'test', instance: 'remote' });
      
      assert.notEqual(stream1, stream2);
      assert.equal(collector.streams.size, 2);
    });
  });

  describe('createMetric', () => {
    it('should create and cache new metric', () => {
      const client = createMockClient();
      const collector = new Collector(client);
      
      const metric = collector.createMetric({ 
        name: 'test_metric', 
        labels: { instance: 'localhost' } 
      });
      
      assert.ok(metric instanceof Metric);
      assert.equal(collector.metrics.size, 1);
      assert.ok(collector.metrics.has(metric.key));
    });

    it('should return existing metric if same name and labels', () => {
      const client = createMockClient();
      const collector = new Collector(client);
      
      const metric1 = collector.createMetric({ 
        name: 'test_metric', 
        labels: { instance: 'localhost' } 
      });
      const metric2 = collector.createMetric({ 
        name: 'test_metric', 
        labels: { instance: 'localhost' } 
      });
      
      assert.equal(metric1, metric2);
      assert.equal(collector.metrics.size, 1);
    });
  });

  describe('Total counting', () => {
    it('should count entries correctly', () => {
      const client = createMockClient();
      const collector = new Collector(client);
      
      const stream = collector.createStream({ job: 'test' });
      
      assert.equal(collector.total, 0);
      
      stream.addEntry(Date.now(), 'Message 1');
      assert.equal(collector.total, 1);
      
      stream.addEntry(Date.now(), 'Message 2');
      assert.equal(collector.total, 2);
    });

    it('should count samples correctly', () => {
      const client = createMockClient();
      const collector = new Collector(client);
      
      const metric = collector.createMetric({ name: 'test_metric' });
      
      assert.equal(collector.total, 0);
      
      metric.addSample(100);
      assert.equal(collector.total, 1);
      
      metric.addSample(200);
      assert.equal(collector.total, 2);
    });

    it('should count both entries and samples', () => {
      const client = createMockClient();
      const collector = new Collector(client);
      
      const stream = collector.createStream({ job: 'test' });
      const metric = collector.createMetric({ name: 'test_metric' });
      
      stream.addEntry(Date.now(), 'Message 1');
      metric.addSample(100);
      stream.addEntry(Date.now(), 'Message 2');
      
      assert.equal(collector.total, 3);
    });
  });

  describe('Options getter', () => {
    it('should return correct options', () => {
      const client = createMockClient();
      const collector = new Collector(client, {
        orgId: 'test-org',
        async: true,
        fpLimit: 1000,
        ttlDays: 30
      });
      
      const options = collector.options;
      
      assert.equal(options.orgId, 'test-org');
      assert.equal(options.async, true);
      assert.equal(options.fpLimit, 1000);
      assert.equal(options.ttlDays, 30);
    });
  });

  describe('Event emission', () => {
    it('should emit error when no valid streams found', async () => {
      const client = createMockClient();
      const collector = new Collector(client, { 
        maxBulkSize: 1000, // High bulk size to prevent auto-push
        maxTimeout: 30000, // Long timeout to prevent auto-push
        cache: {
          max: 10,
          ttl: 50, // Very short TTL to cause expiry
          updateAgeOnGet: true
        }
      });
      
      return new Promise((resolve) => {
        collector.on('error', (error) => {
          assert.ok(error);
          assert.ok(error.message.includes('No valid streams found'));
          assert.equal(error.statusCode, 400);
          resolve();
        });
        
        // Create stream and add entry to increment counter
        const stream = collector.createStream({ job: 'test' });
        stream.addEntry(Date.now(), 'test message');
        
        // Wait for TTL expiry, then trigger push
        setTimeout(() => {
          collector.pushBulk();
        }, 100);
      });
    });

    it('should emit error when no valid metrics found', async () => {
      const client = createMockClient();
      const collector = new Collector(client, { 
        maxBulkSize: 1000,
        maxTimeout: 30000,
        cache: {
          max: 10,
          ttl: 50, // Very short TTL
          updateAgeOnGet: true
        }
      });
      
      return new Promise((resolve) => {
        collector.on('error', (error) => {
          assert.ok(error);
          assert.ok(error.message.includes('No valid metrics found'));
          assert.equal(error.statusCode, 400);
          resolve();
        });
        
        // Create metric, add sample, then wait for expiry
        const metric = collector.createMetric({ name: 'test_metric' });
        metric.addSample(100);
        
        // Wait for TTL expiry, then trigger push
        setTimeout(() => {
          collector.pushBulk();
        }, 100);
      });
    });
  });

  describe('LRU Cache behavior', () => {
    it('should use get() to refresh TTL during push', async () => {
      const client = createMockClient();
      const collector = new Collector(client, {
        maxBulkSize: 1000,
        maxTimeout: 30000,
        cache: {
          max: 10,
          ttl: 1000,
          updateAgeOnGet: true
        }
      });
      
      return new Promise((resolve) => {
        collector.on('info', () => {
          resolve();
        });
        
        const stream = collector.createStream({ job: 'test' });
        stream.addEntry(Date.now(), 'test message');
        
        collector.pushBulk();
      });
    });
  });
});