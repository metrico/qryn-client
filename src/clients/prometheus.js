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


    const timeseries = metrics.map(metric => metric.toTimeSeries());
    const writeRequest = { timeseries };

    const buffer = this.protobufHandler.encodeWriteRequest(writeRequest);
    const compressedBuffer = await this.protobufHandler.compressBuffer(buffer);



    try {
      return await this.service.request('/api/v1/prom/remote/write', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-protobuf',
          'Content-Encoding': 'snappy',
          'X-Prometheus-Remote-Write-Version': '0.1.0'
        },
        body: compressedBuffer
      });
    } catch (error) {
      if (error instanceof QrynError) {
        throw error;
      }
      throw new QrynError(`Prometheus Remote Write push failed: ${error.message}`, error.statusCode);
    }
  }
}

module.exports = Prometheus;