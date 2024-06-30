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

  async push(metrics) {
    if (!Array.isArray(metrics) || !metrics.every(m => m instanceof Metric)) {
      throw new QrynError('Metrics must be an array of Metric instances');
    }

    const timeseries = metrics.map(metric => metric.collect());
    const writeRequest = { timeseries };

    const buffer = this.protobufHandler.encodeWriteRequest(writeRequest);
    const compressedBuffer = await this.protobufHandler.compressBuffer(buffer);

    return this.service.request('/api/v1/prom/remote/write', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-protobuf',
        'Content-Encoding': 'snappy',
        'X-Prometheus-Remote-Write-Version': '0.1.0'
      },
      body: compressedBuffer
    }).then(res => {
      metrics.forEach(metric => metric.reset());
      return res;
    }).catch(error => {
        metrics.forEach(metric => metric.undo());
        if (error instanceof QrynError) {
          throw error;
        }
        throw new QrynError(`Prometheus Remote Write push failed: ${error.message}`, error.statusCode);
    }) 
  }
}

module.exports = Prometheus;