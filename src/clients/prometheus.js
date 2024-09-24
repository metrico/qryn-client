const Http = require('../services/http')
const Protobuff = require('../services/protobuff')
const path = require('path');
const {Metric} = require('../models')
const {QrynError} = require('../types')

class Prometheus {
  /**
   * Create a new PrometheusRemoteWrite instance.
   * @param {Http} service - The HTTP service for making requests.
   */
  constructor(service) {
    this.service = service;
    this.protobufHandler = new Protobuff();
  }

  /**
   * Push metrics to Prometheus remote write endpoint.
   * @param {Metric[]} metrics - An array of Metric instances to push.
   * @param {Object} options - Additional options for the push request.
   * @param {string} [options.orgId] - The organization ID to include in the request headers.
   * @returns {Promise<Object>} A promise that resolves to the response from the remote write endpoint.
   * @throws {QrynError} If the metrics are not an array of Metric instances or if the push request fails.
   */
  async push(metrics, options) {
    let timeseries = [];
    if (!Array.isArray(metrics) || !metrics.every(m => {
        if(m instanceof Metric){
          if(m.samples.length)
            timeseries.push(m.collect())
            return m;
        }
      
    })) {
      throw new QrynError('Metrics must be an array of Metric instances');
    }
    if(!timeseries.length) return;
    //const timeseries = metrics.map(metric => metric.collect());
    const writeRequest = { timeseries };

    const buffer = this.protobufHandler.encodeWriteRequest(writeRequest);
    const compressedBuffer = await this.protobufHandler.compressBuffer(buffer);

    return this.service.request('/api/v1/prom/remote/write', {
      method: 'POST',
      headers: this.headers(options),
      body: compressedBuffer
    }).then(res => {
      metrics.forEach(metric => metric.confirm());
      return res;
    }).catch(error => {
      metrics.forEach(metric => metric.undo());
      if (error instanceof QrynError) {
        throw error;
      }
      throw new QrynError(`Prometheus Remote Write push failed: ${error.message}`, error.statusCode);
    });
  }

  headers(options = {}) {
    let headers = {
      'Content-Type': 'application/x-protobuf',
      'Content-Encoding': 'snappy',
      'X-Prometheus-Remote-Write-Version': '0.1.0'
    };
    if (options.orgId) headers['X-Scope-OrgID'] = options.orgId;
    if (options.async) headers['X-Async-Insert'] = options.async;
    if (options.fpLimit) headers['X-Ttl-Days'] = options.fpLimit;
    if (options.ttlDays) headers['X-FP-LIMIT'] = options.ttlDays;
    return headers;
  }
}

module.exports = Prometheus;