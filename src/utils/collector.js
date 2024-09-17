const { QrynError, NetworkError, ValidationError } = require('../types');
const { Stream, Metric } = require('../models');
const EventEmitter = require('events');

/**
 * Collector class for collecting and pushing streams and metrics to Qryn.
 * @extends EventEmitter
 */
class Collector extends EventEmitter {
  /**
   * Create a Collector instance.
   * @param {Object} qrynClient - The Qryn client instance.
   * @param {Object} [options={}] - The collector options.
   * @param {number} [options.maxBulkSize=1000] - The maximum bulk size for pushing data.
   * @param {number} [options.maxTimeout=5000] - The maximum timeout for pushing data.
   * @param {string} options.orgId - The organization ID.
   * @param {number} [options.retryAttempts=3] - The number of retry attempts for failed pushes.
   * @param {number} [options.retryDelay=1000] - The delay between retry attempts in milliseconds.
   */
  constructor(qrynClient, options = {}) {
    super();
    this.qrynClient = qrynClient;
    this.maxBulkSize = options.maxBulkSize || 1000;
    this.maxTimeout = options.maxTimeout || 5000;
    this.orgId = options.orgId;
    this.retryAttempts = options.retryAttempts || 3;
    this.retryDelay = options.retryDelay || 1000;
    this.streams = [];
    this.metrics = [];
    this.timeoutId = null;
  }

  /**
   * Get the current options for the collector.
   * @returns {Object} The current options.
   */
  get options() {
    return {
      orgId: this.orgId
    }
  }

  /**
   * Add a stream to the collector.
   * @param {Stream} stream - The stream instance to add.
   * @throws {ValidationError} If the stream is not a valid Stream instance.
   */
  addStream(stream) {
    if (!(stream instanceof Stream)) {
      const error = new ValidationError('Invalid stream instance');
      this.emit('error', error);
      throw error;
    }
    this.streams.push(stream);
    this.checkBulkSize();
  }

  /**
   * Add a metric to the collector.
   * @param {Metric} metric - The metric instance to add.
   * @throws {ValidationError} If the metric is not a valid Metric instance.
   */
  addMetric(metric) {
    if (!(metric instanceof Metric)) {
      const error = new ValidationError('Invalid metric instance');
      this.emit('error', error);
      throw error;
    }
    this.metrics.push(metric);
    this.checkBulkSize();
  }

  /**
   * Check the bulk size and push the data if the maximum size is reached.
   * @private
   */
  checkBulkSize() {
    if (this.streams.length + this.metrics.length >= this.maxBulkSize) {
      this.pushBulk();
    } else {
      this.resetTimeout();
    }
  }

  /**
   * Reset the timeout for pushing data.
   * @private
   */
  resetTimeout() {
    clearTimeout(this.timeoutId);
    this.timeoutId = setTimeout(() => {
      this.pushBulk();
    }, this.maxTimeout);
  }

  /**
   * Push the collected streams and metrics to Qryn.
   * @private
   * @async
   */
  async pushBulk() {
    clearTimeout(this.timeoutId);
    await this.retryOperation(async () => {
      if (this.streams.length > 0) {
        await this.qrynClient.loki.push(this.streams, this.options);
        this.streams = [];
      }
      if (this.metrics.length > 0) {
        await this.qrynClient.prom.push(this.metrics, this.options);
        this.metrics = [];
      }
    });
  }

  /**
   * Retry an operation with exponential backoff.
   * @private
   * @async
   * @param {Function} operation - The operation to retry.
   * @throws {QrynError} If all retry attempts fail.
   */
  async retryOperation(operation) {
    for (let attempt = 1; attempt <= this.retryAttempts; attempt++) {
      try {
        await operation();
        return;
      } catch (error) {
        if (attempt === this.retryAttempts) {
          const qrynError = new QrynError('Failed to push data after multiple attempts', { cause: error });
          this.emit('error', qrynError);
          throw qrynError;
        }
        await new Promise(resolve => setTimeout(resolve, this.retryDelay * Math.pow(2, attempt - 1)));
      }
    }
  }
}

module.exports = Collector;