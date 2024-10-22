const {Stream, Metric} = require('./models')
const PrometheusClient = require('./clients/prometheus')
const Collector = require('./utils/collector');
const LokiClient = require('./clients/loki')
const Http = require('./services/http')



class Auth{
  constructor({username, password}){
    this.username = username;
    this.password = password;
  }
}


/**
 * Main client for qryn operations.
 */
class QrynClient {
  /**
   * Create a QrynClient.
   * @param {Object} config - The configuration object.
   * @param {string} [config.baseUrl='http://localhost:3100'] - The base URL for the qryn server.
   * @param {Auth} [config.auth] - The base Auth for the qryn server.
   * @param {number} [config.timeout=5000] - The timeout for requests in milliseconds.
   * @param {Object} [config.headers={}] - Additional headers to send with requests.
   */
  constructor(config) {
    if (typeof config !== 'object' || config === null) {
      throw new QrynError('Config must be a non-null object');
    }
    const auth = config.auth
    const baseUrl = config.baseUrl || 'http://localhost:3100';
    const timeout = config.timeout || 5000;
    const headers = {
      'Content-Type': 'application/json',
      ...config.headers
    };
    const http = new Http(baseUrl, timeout, headers, auth);
    this.prom = new PrometheusClient(http);
    this.loki = new LokiClient(http);
  }
  
  /**
 * Creates a new Collector instance.
 *
 * @param {Object} [config] - The configuration options for the Collector.
 * @param {number} [config.maxBulkSize=1000] - The maximum number of items to store in the bulk before pushing.
 * @param {number} [config.maxTimeout=5000] - The maximum time in milliseconds to wait before pushing the bulk.
 * @returns {Collector} A new Collector instance.
 *
 * @example
 * const qrynClient = new QrynClient({
 *   // ... qrynClient configuration
 * });
 *
 * const collector = qrynClient.createCollector({
 *   maxBulkSize: 500,
 *   maxTimeout: 3000
 * });
 */
  createCollector(config){
    return new Collector(this, config);
  }

  /**
   * Create a new Stream instance.
   * @param {Object} labels - The labels for the stream.
   * @returns {Stream} A new Stream instance.
   */
  createStream(labels) {
    return new Stream(labels);
  }

/**
 * Create a new Metric instance.
 * @param {string} name - The name of the metric.
 * @param {Object} [labels={}] - Optional labels for the metric.
 * @returns {Metric} A new Metric instance.
 */
  createMetric({ name, labels = {} }) {
    return new Metric(name, labels);
  }

  // Add more methods for other qryn operations as needed
}

module.exports = { QrynClient, Stream, Metric, Collector };