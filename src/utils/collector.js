const { QrynError } = require('../types');
const { Stream, Metric } = require('../models');

/**
 * Collector class for collecting and pushing streams and metrics to Qryn.
 */
class Collector {
  /**
   * Create a Collector instance.
   * @param {Object} qrynClient - The Qryn client instance.
   * @param {Object} [options={}] - The collector options.
   * @param {number} [options.maxBulkSize=1000] - The maximum bulk size for pushing data.
   * @param {number} [options.maxTimeout=5000] - The maximum timeout for pushing data.
   * @param {string} options.orgId - The organization ID.
   */
  constructor(qrynClient, options = {}) {
    this.qrynClient = qrynClient;
    this.maxBulkSize = options.maxBulkSize || 1000;
    this.maxTimeout = options.maxTimeout || 5000;
    this.orgId = options.orgId;
    this.streams = [];
    this.metrics = [];
    this.timeoutId = null;
  }
  get options(){
    return {
      orgId: this.orgId
    }
  }

  /**
   * Add a stream to the collector.
   * @param {Stream} stream - The stream instance to add.
   * @throws {QrynError} If the stream is not a valid Stream instance.
   */
  addStream(stream) {
    if (!(stream instanceof Stream)) {
      throw new QrynError('Invalid stream instance');
    }
    this.streams.push(stream);
    this.checkBulkSize();
  }

  /**
   * Add a metric to the collector.
   * @param {Metric} metric - The metric instance to add.
   * @throws {QrynError} If the metric is not a valid Metric instance.
   */
  addMetric(metric) {
    if (!(metric instanceof Metric)) {
      throw new QrynError('Invalid metric instance');
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
    if (this.streams.length > 0) {
      await this.qrynClient.loki.push(this.streams, this.options);
      this.streams = [];
    }
    if (this.metrics.length > 0) {
      await this.qrynClient.prom.push(this.metrics, this.options);
      this.metrics = [];
    }
  }
}

module.exports = Collector;