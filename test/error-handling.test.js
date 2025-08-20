const { describe, it } = require('node:test');
const assert = require('node:assert');
const { GigapipeError } = require('../src/types');

describe('Error Handling', () => {
  describe('GigapipeError', () => {
    it('should create GigapipeError with message only', () => {
      const error = new GigapipeError('Test error');
      
      assert.ok(error instanceof Error);
      assert.ok(error instanceof GigapipeError);
      assert.equal(error.name, 'GigapipeError');
      assert.equal(error.message, 'Test error');
      assert.equal(error.statusCode, null);
      assert.equal(error.cause, undefined);
      assert.equal(error.path, undefined);
    });

    it('should create GigapipeError with all parameters', () => {
      const cause = new Error('Original error');
      const error = new GigapipeError('Test error', 400, cause, '/test/path');
      
      assert.equal(error.message, 'Test error');
      assert.equal(error.statusCode, 400);
      assert.equal(error.cause, cause);
      assert.equal(error.path, '/test/path');
    });

    it('should create GigapipeError with statusCode only', () => {
      const error = new GigapipeError('Test error', 404);
      
      assert.equal(error.message, 'Test error');
      assert.equal(error.statusCode, 404);
      assert.equal(error.cause, undefined);
      assert.equal(error.path, undefined);
    });
  });

  describe('Stream Error Handling', () => {
    it('should handle invalid listener in addListener', () => {
      const Stream = require('../src/models/stream.js');
      const stream = new Stream({ job: 'test' });
      
      assert.throws(() => {
        stream.addListener('not a function');
      }, /Callback must be a function/);
    });
  });

  describe('Metric Error Handling', () => {
    it('should handle invalid value in addSample', () => {
      const Metric = require('../src/models/metric.js');
      const metric = new Metric('test_metric');
      
      assert.throws(() => {
        metric.addSample('invalid');
      }, /Value and timestamp must be numbers/);
      
      assert.throws(() => {
        metric.addSample(null);
      }, /Value and timestamp must be numbers/);
      
      assert.throws(() => {
        metric.addSample(undefined);
      }, /Value and timestamp must be numbers/);
    });

    it('should handle invalid timestamp in addSample', () => {
      const Metric = require('../src/models/metric.js');
      const metric = new Metric('test_metric');
      
      assert.throws(() => {
        metric.addSample(100, 'invalid');
      }, /Value and timestamp must be numbers/);
      
      assert.throws(() => {
        metric.addSample(100, null);
      }, /Value and timestamp must be numbers/);
    });

    it('should handle invalid listener in addListener', () => {
      const Metric = require('../src/models/metric.js');
      const metric = new Metric('test_metric');
      
      assert.throws(() => {
        metric.addListener('not a function');
      }, /Callback must be a function/);
    });
  });

  describe('HTTP Error Handling', () => {
    it('should handle GigapipeError propagation', () => {
      const Http = require('../src/services/http.js');
      
      // Test that GigapipeError constructor doesn't throw
      assert.doesNotThrow(() => {
        new GigapipeError('HTTP error', 500, new Error('Network error'), '/api/push');
      });
    });
  });

  describe('Collector Error Scenarios', () => {
    it('should handle empty collections during push', async () => {
      const Collector = require('../src/utils/collector.js');
      
      // Mock client that should never be called
      const mockClient = {
        loki: {
          push: async () => {
            throw new Error('Should not be called');
          }
        },
        prom: {
          push: async () => {
            throw new Error('Should not be called');
          }
        }
      };
      
      const collector = new Collector(mockClient, {
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
          assert.ok(error.message.includes('No valid streams found'));
          resolve();
        });
        
        // Create stream and add entry
        const stream = collector.createStream({ job: 'test' });
        stream.addEntry(Date.now(), 'test message');
        
        // Wait for TTL expiry, then push
        setTimeout(() => {
          collector.pushBulk();
        }, 100);
      });
    });

    it('should handle retry mechanism failure', async () => {
      const Collector = require('../src/utils/collector.js');
      
      // Mock client that always fails
      const mockClient = {
        loki: {
          push: async () => {
            throw new GigapipeError('Push failed', 500);
          }
        }
      };
      
      const collector = new Collector(mockClient, {
        maxBulkSize: 1,
        maxTimeout: 30000,
        retryAttempts: 2,
        retryDelay: 10 // Very short delay for testing
      });
      
      return new Promise((resolve) => {
        collector.on('error', (error) => {
          assert.equal(error.message, 'Push failed');
          assert.equal(error.statusCode, 500);
          resolve();
        });
        
        const stream = collector.createStream({ job: 'test' });
        stream.addEntry(Date.now(), 'test message');
        
        collector.pushBulk();
      });
    });
  });

  describe('Client Error Handling', () => {
    it('should throw error for invalid config', () => {
      const { GigapipeClient } = require('../src/index.js');
      
      assert.throws(() => {
        new GigapipeClient(null);
      }, /Config must be a non-null object/);
      
      assert.throws(() => {
        new GigapipeClient(undefined);
      }, /Config must be a non-null object/);
      
      assert.throws(() => {
        new GigapipeClient('string');
      }, /Config must be a non-null object/);
      
      assert.throws(() => {
        new GigapipeClient(123);
      }, /Config must be a non-null object/);
    });
  });
});