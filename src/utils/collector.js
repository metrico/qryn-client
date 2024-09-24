const { QrynError, ValidationError } = require('../types');
const { Stream, Metric } = require('../models');
const EventEmitter = require('events');
const { LRUCache } = require('lru-cache')

/**
 * Collector class for collecting and pushing streams and metrics to Qryn.
 * @extends EventEmitter
 */
class Collector extends EventEmitter {
  /**
   * Create a Collector instance.
   * @param {Object} qrynClient - The Qryn client instance.
   * @param {Object} [options={}] - The collector options.
   * @param {number} [options.maxEntries=1000] - The maximum entries for pushing data.
   * @param {number} [options.maxTimeout=5000] - The maximum timeout for pushing data.
   * @param {string} options.orgId - orgId to write the data.
   * @param {number} [options.retryAttempts=3] - The number of retry attempts for failed pushes.
   * @param {number} [options.retryDelay=1000] - The delay between retry attempts in milliseconds.
   * @param {boolean} [options.async] - Write the data in fast but unreliable way.
   * @param {number} [options.fpLimit] - Limit number of time-series you want to have inside the database.
   * @param {number} [options.ttlDays] - Number of days the information in the request should be stored.
   * @param {LRUCache.Options} [options.cache] - Cache options for streams and metrics.
   */
  #totalEntries = 0; 
  #totalSamples = 0;
  constructor(qrynClient, options = {}) {
    super();
    this.qrynClient = qrynClient;
    this.maxBulkSize = options.maxBulkSize || 1000;
    this.maxTimeout = options.maxTimeout || 5000;
    this.orgId = options.orgId;
    this.async = options.async;
    this.fpLimit = options.fpLimit;
    this.ttlDays = options.ttlDays;
    this.cacheOptions = options.cache;
    this.retryAttempts = options.retryAttempts || 3;
    this.retryDelay = options.retryDelay || 1000;
    this.streams = this.initializeCache(this.cacheOptions);
    this.metrics = this.initializeCache(this.cacheOptions);
    this.timeoutId = null;
  }
  initializeCache(options = {}){
    const defaultCacheOptions = {
      max: 10000, // Maximum number of items in the cache
      ttl: 1000 * 60 * 60, // Time to live: 1 hour in milliseconds
      updateAgeOnGet: true, // Update the age of an item when it's accessed
      allowStale: false, // Don't serve stale items
    };
    let cacheOptions = Object.assign(options,defaultCacheOptions)

    return new LRUCache(cacheOptions)
  }
  get total(){
    return this.#totalEntries + this.#totalSamples;
  }
  /**
   * Get the current options for the collector.
   * @returns {Object} The current options.
   */
  get options() {
    return {
      orgId: this.orgId,
      async: this.async,
      fpLimit: this.fpLimit,
      ttlDays: this.ttlDays
    }
  }

  /**
   * Create a new stream and add it to the collector.
   * @param {Object} [labels={}] - The labels for the stream.
   * @returns {Stream} The created stream instance.
   */
  createStream(labels = {}) {
    let stream = new Stream(labels, { maxEntries: this.maxEntries, maxTimeout: this.maxTimeout });
    let existingStream = this.streams.get(stream.key);
    if (!existingStream) {
      stream.addListener(this.incrementTotal.bind(this));
      this.streams.set(stream.key, stream);
    } else {
      stream = existingStream;
    }
    return stream;
  }

  /**
   * Create a new metric and add it to the collector.
   * @param {Object} params - The parameters for creating a metric.
   * @param {string} params.name - The name of the metric.
   * @param {Object} [params.labels={}] - The labels for the metric.
   * @returns {Metric} The created metric instance.
   */
  createMetric({ name, labels = {} }) {
    let metric = new Metric(name, labels, { maxSamples: this.maxEntries, maxTimeout: this.maxTimeout });
    let existingMetric = this.metrics.get(metric.key);
    if (!existingMetric) {
      metric.addListener(this.incrementTotal.bind(this));
      this.metrics.set(metric.key, metric);
    } else {
      metric = existingMetric;
    }
    return metric;
  }
  incrementTotal(e){
    if(e instanceof Metric)
      this.#totalSamples++;
    else if(e instanceof Stream)
      this.#totalEntries ++;

    this.checkBulkSize();
  }

  /**
   * Check the bulk size and push the data if the maximum size is reached.
   * @private
   */
  checkBulkSize() {
    if (this.total >= this.maxBulkSize) {
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

    const totalEntries = this.#totalEntries;
    const totalSamples = this.#totalSamples;
    this.#totalEntries = 0;
    this.#totalSamples = 0;


    await this.retryOperation(async () => {
      if (totalEntries > 0) {        
        const streams = Array.from(this.streams.values());
        await this.qrynClient.loki.push(streams, this.options).then( response => this.emit('info', response));
      }
      if (totalSamples > 0) {
        const metrics = Array.from(this.metrics.values());
        await this.qrynClient.prom.push(metrics, this.options).then( response => this.emit('info', response));;
      }
    }).catch(error => {
        this.#totalEntries += totalEntries;
        this.#totalSamples += totalSamples;
        this.emit('error', error);
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
          throw error;
        }
        await new Promise(resolve => setTimeout(resolve, this.retryDelay * Math.pow(2, attempt - 1)));
      }
    }
  }
}

module.exports = Collector;