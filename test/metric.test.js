const { describe, it } = require('node:test');
const assert = require('node:assert');
const Metric = require('../src/models/metric.js');

describe('Metric', () => {
  describe('Constructor', () => {
    it('should create Metric with name and labels', () => {
      const metric = new Metric('test_metric', { instance: 'localhost' });
      
      assert.ok(metric);
      assert.equal(metric.name, 'test_metric');
      assert.deepEqual(metric.labels, { instance: 'localhost' });
      assert.ok(Array.isArray(metric.samples));
      assert.equal(metric.samples.length, 0);
    });

    it('should create Metric with empty labels', () => {
      const metric = new Metric('test_metric');
      
      assert.ok(metric);
      assert.equal(metric.name, 'test_metric');
      assert.deepEqual(metric.labels, {});
    });

    it('should generate correct key', () => {
      const metric = new Metric('test_metric', { instance: 'localhost' });
      
      assert.ok(typeof metric.key === 'string');
      assert.ok(metric.key.includes('test_metric'));
      assert.ok(metric.key.includes('localhost'));
    });

    it('should generate labels correctly', () => {
      const metric = new Metric('test_metric', { instance: 'localhost', job: 'test' });
      const generatedLabels = metric.generateLabels();
      
      assert.ok(Array.isArray(generatedLabels));
      
      // Should include __name__ label
      const nameLabel = generatedLabels.find(l => l.name === '__name__');
      assert.ok(nameLabel);
      assert.equal(nameLabel.value, 'test_metric');
      
      // Should include custom labels
      const instanceLabel = generatedLabels.find(l => l.name === 'instance');
      assert.ok(instanceLabel);
      assert.equal(instanceLabel.value, 'localhost');
    });
  });

  describe('addSample', () => {
    it('should add sample with value and timestamp', () => {
      const metric = new Metric('test_metric');
      const timestamp = Date.now();
      
      metric.addSample(100, timestamp);
      
      assert.equal(metric.samples.length, 1);
      assert.equal(metric.samples[0].value, 100);
      assert.equal(metric.samples[0].timestamp, timestamp);
    });

    it('should add sample with default timestamp', () => {
      const metric = new Metric('test_metric');
      const beforeTime = Date.now();
      
      metric.addSample(100);
      
      const afterTime = Date.now();
      
      assert.equal(metric.samples.length, 1);
      assert.equal(metric.samples[0].value, 100);
      assert.ok(metric.samples[0].timestamp >= beforeTime);
      assert.ok(metric.samples[0].timestamp <= afterTime);
    });

    it('should add multiple samples', () => {
      const metric = new Metric('test_metric');
      
      metric.addSample(100, 1000);
      metric.addSample(200, 2000);
      metric.addSample(300, 3000);
      
      assert.equal(metric.samples.length, 3);
      assert.equal(metric.samples[0].value, 100);
      assert.equal(metric.samples[1].value, 200);
      assert.equal(metric.samples[2].value, 300);
    });

    it('should throw error for invalid value type', () => {
      const metric = new Metric('test_metric');
      
      assert.throws(() => {
        metric.addSample('invalid');
      }, /Value and timestamp must be numbers/);
    });

    it('should throw error for invalid timestamp type', () => {
      const metric = new Metric('test_metric');
      
      assert.throws(() => {
        metric.addSample(100, 'invalid');
      }, /Value and timestamp must be numbers/);
    });
  });

  describe('collect', () => {
    it('should return metric data and clear samples', () => {
      const metric = new Metric('test_metric', { instance: 'localhost' });
      
      metric.addSample(100, 1000);
      metric.addSample(200, 2000);
      
      const collected = metric.collect();
      
      assert.ok(collected);
      assert.ok(Array.isArray(collected.labels));
      assert.ok(Array.isArray(collected.samples));
      assert.equal(collected.samples.length, 2);
      assert.deepEqual(collected.samples[0], { value: 100, timestamp: 1000 });
      assert.deepEqual(collected.samples[1], { value: 200, timestamp: 2000 });
      
      // Should clear samples after collect
      assert.equal(metric.samples.length, 0);
    });

    it('should store collected samples for confirm/undo', () => {
      const metric = new Metric('test_metric');
      
      metric.addSample(100, 1000);
      metric.collect();
      
      // collectedSamples should contain the original samples
      assert.equal(metric.collectedSamples.length, 1);
      assert.deepEqual(metric.collectedSamples[0], { value: 100, timestamp: 1000 });
    });
  });

  describe('confirm', () => {
    it('should clear collected samples', () => {
      const metric = new Metric('test_metric');
      
      metric.addSample(100, 1000);
      metric.collect();
      metric.confirm();
      
      assert.equal(metric.collectedSamples.length, 0);
    });
  });

  describe('undo', () => {
    it('should restore collected samples to samples', () => {
      const metric = new Metric('test_metric');
      
      metric.addSample(100, 1000);
      metric.addSample(200, 2000);
      metric.collect();
      
      // Add new sample after collect
      metric.addSample(300, 3000);
      
      metric.undo();
      
      // Should restore collected samples and keep new ones
      assert.equal(metric.samples.length, 3);
      assert.deepEqual(metric.samples[0], { value: 100, timestamp: 1000 });
      assert.deepEqual(metric.samples[1], { value: 200, timestamp: 2000 });
      assert.deepEqual(metric.samples[2], { value: 300, timestamp: 3000 });
      assert.equal(metric.collectedSamples.length, 0);
    });
  });

  describe('reset', () => {
    it('should clear all samples and collected samples', () => {
      const metric = new Metric('test_metric');
      
      metric.addSample(100, 1000);
      metric.collect();
      metric.addSample(200, 2000);
      
      metric.reset();
      
      assert.equal(metric.samples.length, 0);
      assert.equal(metric.collectedSamples.length, 0);
    });
  });

  describe('Event handling', () => {
    it('should notify listeners when samples are added', () => {
      const metric = new Metric('test_metric');
      let notified = false;
      let notifiedMetric = null;
      
      metric.addListener((m) => {
        notified = true;
        notifiedMetric = m;
      });
      
      metric.addSample(100);
      
      assert.equal(notified, true);
      assert.equal(notifiedMetric, metric);
    });

    it('should handle multiple listeners', () => {
      const metric = new Metric('test_metric');
      let count = 0;
      
      metric.addListener(() => count++);
      metric.addListener(() => count++);
      
      metric.addSample(100);
      
      assert.equal(count, 2);
    });

    it('should check hasBulkProcessing property', () => {
      const metric = new Metric('test_metric');
      
      assert.equal(metric.hasBulkProcessing, false);
      
      metric.addListener(() => {});
      
      assert.equal(metric.hasBulkProcessing, true);
    });
  });
});