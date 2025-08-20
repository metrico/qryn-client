const { describe, it } = require('node:test');
const assert = require('node:assert');
const { GigapipeClient, Stream, Metric } = require('../src/index.js');

describe('GigapipeClient', () => {
  describe('Constructor', () => {
    it('should create GigapipeClient with valid config', () => {
      const client = new GigapipeClient({
        baseUrl: 'http://localhost:3100',
        auth: { username: 'test', password: 'test' },
        timeout: 5000
      });
      
      assert.ok(client);
      assert.ok(client.prom);
      assert.ok(client.loki);
      assert.ok(client.tempo);
    });

    it('should throw error with invalid config', () => {
      assert.throws(() => {
        new GigapipeClient(null);
      }, /Config must be a non-null object/);
      
      assert.throws(() => {
        new GigapipeClient('invalid');
      }, /Config must be a non-null object/);
    });

    it('should use default baseUrl when not provided', () => {
      const client = new GigapipeClient({
        auth: { username: 'test', password: 'test' }
      });
      
      assert.ok(client);
    });
  });

  describe('createStream', () => {
    it('should create Stream with labels', () => {
      const client = new GigapipeClient({
        baseUrl: 'http://localhost:3100',
        auth: { username: 'test', password: 'test' }
      });
      
      const labels = { job: 'test', instance: 'localhost' };
      const stream = client.createStream(labels);
      
      assert.ok(stream instanceof Stream);
      assert.deepEqual(stream.labels, labels);
    });

    it('should create Stream with empty labels', () => {
      const client = new GigapipeClient({
        baseUrl: 'http://localhost:3100',
        auth: { username: 'test', password: 'test' }
      });
      
      const stream = client.createStream();
      assert.ok(stream instanceof Stream);
    });
  });

  describe('createMetric', () => {
    it('should create Metric with name and labels', () => {
      const client = new GigapipeClient({
        baseUrl: 'http://localhost:3100',
        auth: { username: 'test', password: 'test' }
      });
      
      const metric = client.createMetric({ 
        name: 'test_metric', 
        labels: { instance: 'localhost' } 
      });
      
      assert.ok(metric instanceof Metric);
      assert.equal(metric.name, 'test_metric');
      assert.deepEqual(metric.labels, { instance: 'localhost' });
    });

    it('should create Metric with empty labels', () => {
      const client = new GigapipeClient({
        baseUrl: 'http://localhost:3100',
        auth: { username: 'test', password: 'test' }
      });
      
      const metric = client.createMetric({ name: 'test_metric' });
      
      assert.ok(metric instanceof Metric);
      assert.equal(metric.name, 'test_metric');
      assert.deepEqual(metric.labels, {});
    });
  });

  describe('createCollector', () => {
    it('should create Collector with default config', () => {
      const client = new GigapipeClient({
        baseUrl: 'http://localhost:3100',
        auth: { username: 'test', password: 'test' }
      });
      
      const collector = client.createCollector();
      
      assert.ok(collector);
      assert.equal(collector.maxBulkSize, 1000);
      assert.equal(collector.maxTimeout, 5000);
    });

    it('should create Collector with custom config', () => {
      const client = new GigapipeClient({
        baseUrl: 'http://localhost:3100',
        auth: { username: 'test', password: 'test' }
      });
      
      const collector = client.createCollector({
        maxBulkSize: 500,
        maxTimeout: 3000,
        orgId: 'test-org'
      });
      
      assert.ok(collector);
      assert.equal(collector.maxBulkSize, 500);
      assert.equal(collector.maxTimeout, 3000);
      assert.equal(collector.orgId, 'test-org');
    });
  });
});