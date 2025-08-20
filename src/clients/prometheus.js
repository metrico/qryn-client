const Http = require('../services/http')
const Protobuff = require('../services/protobuff')
const path = require('path');
const {Metric} = require('../models')
const {GigapipeError} = require('../types');


class Read {
  constructor(service, options) {
    this.service = service;
    this.options = options;
  }

  /**
   * Execute a PromQL query and retrieve the result.
   * @param {string} query - The PromQL query string.
   * @returns {Promise<GigapipeResponse>} A promise that resolves to the response from the query endpoint.
   * @throws {GigapipeError} If the query request fails.
   */
  async query(query) {
    return this.service.request('/api/v1/query', {
      method: 'POST',
      headers: this.headers(),
      body: { query }
    }).catch(error => {
      if (error instanceof GigapipeError) {
        throw error;
      }
      throw new GigapipeError(`Prometheus query failed: ${error.message}`, error.statusCode);
    });
  }

  /**
   * Execute a PromQL query over a range of time.
   * @param {string} query - The PromQL query string.
   * @param {number} start - The start timestamp in seconds.
   * @param {number} end - The end timestamp in seconds.
   * @param {string} step - The query resolution step width in duration format (e.g., '15s').
   * @returns {Promise<GigapipeResponse>} A promise that resolves to the response from the query range endpoint.
   * @throws {GigapipeError} If the query range request fails.
   */
  async queryRange(query, start, end, step) {

    return this.service.request('/api/v1/query_range', {
      method: 'POST',
      headers: this.headers(),
      body: new URLSearchParams({query, start, end, step})
    }).catch(error => {
      if (error instanceof GigapipeError) {
        throw error;
      }
      throw new GigapipeError(`Prometheus query range failed: ${error.message}`, error.statusCode);
    });
  }

  /**
   * Retrieve the list of label names.
   * @returns {Promise<GigapipeResponse>} A promise that resolves to the response from the labels endpoint.
   * @throws {GigapipeError} If the labels request fails.
   */
  async labels() {
    return this.service.request('/api/v1/labels', {
      method: 'GET',
      headers: this.headers()
    }).catch(error => {
      if (error instanceof GigapipeError) {
        throw error;
      }
      throw new GigapipeError(`Prometheus labels retrieval failed: ${error.message}`, error.statusCode);
    });
  }

  /**
   * Retrieve the list of label values for a specific label name.
   * @param {string} labelName - The name of the label.
   * @returns {Promise<GigapipeResponse>} A promise that resolves to the response from the label values endpoint.
   * @throws {GigapipeError} If the label values request fails.
   */
  async labelValues(labelName) {
    return this.service.request(`/api/v1/label/${labelName}/values`, {
      method: 'GET',
      headers: this.headers()
    }).catch(error => {
      if (error instanceof GigapipeError) {
        throw error;
      }
      throw new GigapipeError(`Prometheus label values retrieval failed: ${error.message}`, error.statusCode);
    });
  }

  /**
   * Retrieve the list of time series that match a specified label set.
   * @param {Array} match - The label set to match.
   * @param {number} start - The start timestamp in seconds.
   * @param {number} end - The end timestamp in seconds.
   * @returns {Promise<GigapipeResponse>} A promise that resolves to the response from the series endpoint.
   * @throws {GigapipeError} If the series request fails.
   */
  async series(match, start, end) {
    let params = new URLSearchParams({start, end })
    if(!match) throw new GigapipeError('match parameter is required');
    if(typeof match  === 'string') match = [match];
    match.forEach( match => params.append('match[]', match));

    return this.service.request('/api/v1/series', {
      method: 'POST',
      headers: this.headers(),
      body: params
    }).catch(error => {
      if (error instanceof GigapipeError) {
        throw error;
      }
      throw new GigapipeError(`Prometheus series retrieval failed: ${error.message}`, error.statusCode);
    });
  }

  /**
   * Retrieve the currently loaded alerting and recording rules.
   * @returns {Promise<GigapipeResponse>} A promise that resolves to the response from the rules endpoint.
   * @throws {GigapipeError} If the rules request fails.
   */
  async rules() {
    return this.service.request('/api/v1/rules', {
      method: 'GET',
      headers: this.headers()
    }).catch(error => {
      if (error instanceof GigapipeError) {
        throw error;
      }
      throw new GigapipeError(`Prometheus rules retrieval failed: ${error.message}`, error.statusCode);
    });
  }

  headers() {
    let headers = {
      'Content-Type': 'application/x-www-form-urlencoded'
    };
    if (this.options.orgId) headers['X-Scope-OrgID'] = this.options.orgId;
    return headers;
  }
}

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
   * @throws {GigapipeError} If the metrics are not an array of Metric instances or if the push request fails.
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
      throw new GigapipeError('Metrics must be an array of Metric instances');
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
      if (error instanceof GigapipeError) {
        throw error;
      }
      throw new GigapipeError(`Prometheus Remote Write push failed: ${error.message}`, error.statusCode);
    });
  }
  /**
  * Create a new Read instance for reading metrics from Prometheus.
  * @param {Object} options - Options for the read operation.
  * @param {string} [options.orgId] - The organization ID to include in the request headers.
  * @returns {Read} A new Read instance.
  */
  createReader(options) {
    return new Read(this.service, options);
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