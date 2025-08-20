const { describe, it } = require('node:test');
const assert = require('node:assert');
const Stream = require('../src/models/stream.js');

describe('Stream', () => {
  describe('Constructor', () => {
    it('should create Stream with labels', () => {
      const labels = { job: 'test', instance: 'localhost' };
      const stream = new Stream(labels);
      
      assert.ok(stream);
      assert.deepEqual(stream.labels, labels);
      assert.ok(Array.isArray(stream.entries));
      assert.equal(stream.entries.length, 0);
    });

    it('should create Stream with empty labels', () => {
      const stream = new Stream({});
      
      assert.ok(stream);
      assert.deepEqual(stream.labels, {});
    });

    it('should generate correct key', () => {
      const stream = new Stream({ job: 'test', instance: 'localhost' });
      const expectedKey = '{job="test",instance="localhost"}';
      
      assert.equal(stream.key, expectedKey);
    });
  });

  describe('addEntry', () => {
    it('should add entry with timestamp and message', () => {
      const stream = new Stream({ job: 'test' });
      const timestamp = Date.now();
      const message = 'Test log message';
      
      stream.addEntry(timestamp, message);
      
      assert.equal(stream.entries.length, 1);
      assert.equal(stream.entries[0].ts, new Date(timestamp).toISOString());
      assert.equal(stream.entries[0].line, message);
    });

    it('should add multiple entries', () => {
      const stream = new Stream({ job: 'test' });
      
      stream.addEntry(1000, 'Message 1');
      stream.addEntry(2000, 'Message 2');
      stream.addEntry(3000, 'Message 3');
      
      assert.equal(stream.entries.length, 3);
      assert.equal(stream.entries[0].line, 'Message 1');
      assert.equal(stream.entries[1].line, 'Message 2');
      assert.equal(stream.entries[2].line, 'Message 3');
    });

    it('should handle numeric timestamp correctly', () => {
      const stream = new Stream({ job: 'test' });
      
      stream.addEntry(1234567890000, 'Test message');
      
      assert.equal(stream.entries.length, 1);
      assert.equal(stream.entries[0].ts, new Date(1234567890000).toISOString());
      assert.equal(stream.entries[0].line, 'Test message');
    });
  });

  describe('collect', () => {
    it('should return stream data and clear entries', () => {
      const stream = new Stream({ job: 'test', instance: 'localhost' });
      
      stream.addEntry(1000, 'Message 1');
      stream.addEntry(2000, 'Message 2');
      
      const collected = stream.collect();
      
      assert.ok(collected);
      assert.equal(collected.labels, '{job="test",instance="localhost"}');
      assert.ok(Array.isArray(collected.entries));
      assert.equal(collected.entries.length, 2);
      assert.equal(collected.entries[0].line, 'Message 1');
      assert.equal(collected.entries[1].line, 'Message 2');
      
      // Should clear entries after collect
      assert.equal(stream.entries.length, 0);
    });

    it('should store collected entries for confirm/undo', () => {
      const stream = new Stream({ job: 'test' });
      
      stream.addEntry(1000, 'Message 1');
      const entriesBeforeCollect = [...stream.entries];
      stream.collect();
      
      // Private field access for testing - entries should be stored internally
      assert.equal(stream.entries.length, 0); // Current entries cleared
      // We can't directly test the private field, but we can test the undo behavior
      stream.undo();
      assert.equal(stream.entries.length, 1);
      assert.equal(stream.entries[0].line, 'Message 1');
    });
  });

  describe('confirm', () => {
    it('should clear collected entries', () => {
      const stream = new Stream({ job: 'test' });
      
      stream.addEntry(1000, 'Message 1');
      stream.collect();
      stream.confirm();
      
      // Test that undo doesn't restore anything after confirm
      stream.undo();
      assert.equal(stream.entries.length, 0);
    });
  });

  describe('undo', () => {
    it('should restore collected entries to entries', () => {
      const stream = new Stream({ job: 'test' });
      
      stream.addEntry(1000, 'Message 1');
      stream.addEntry(2000, 'Message 2');
      stream.collect();
      
      // Add new entry after collect
      stream.addEntry(3000, 'Message 3');
      
      stream.undo();
      
      // Should restore collected entries and keep new ones
      assert.equal(stream.entries.length, 3);
      assert.equal(stream.entries[0].line, 'Message 1');
      assert.equal(stream.entries[1].line, 'Message 2');
      assert.equal(stream.entries[2].line, 'Message 3');
    });
  });

  describe('reset', () => {
    it('should clear all entries and collected entries', () => {
      const stream = new Stream({ job: 'test' });
      
      stream.addEntry(1000, 'Message 1');
      stream.collect();
      stream.addEntry(2000, 'Message 2');
      
      stream.reset();
      
      assert.equal(stream.entries.length, 0);
      // Test that undo doesn't restore anything after reset
      stream.undo();
      assert.equal(stream.entries.length, 0);
    });
  });

  describe('Event handling', () => {
    it('should notify listeners when entries are added', () => {
      const stream = new Stream({ job: 'test' });
      let notified = false;
      let notifiedStream = null;
      
      stream.addListener((s) => {
        notified = true;
        notifiedStream = s;
      });
      
      stream.addEntry(1000, 'Test message');
      
      assert.equal(notified, true);
      assert.equal(notifiedStream, stream);
    });

    it('should handle multiple listeners', () => {
      const stream = new Stream({ job: 'test' });
      let count = 0;
      
      stream.addListener(() => count++);
      stream.addListener(() => count++);
      
      stream.addEntry(1000, 'Test message');
      
      assert.equal(count, 2);
    });
  });
});