const Protobuff = require('../services/protobuff');
const { Metric } = require('../models');
const { GigapipeError } = require('../types');

class Read {
  constructor(service, options) {
    this.service = service;
    this.options = options || {};
  }

  /**
   * @param {string} query
   * @param {Object} [opts] ReadOpts
   */
  async query(query, opts = {}) {
    return this.service.request('/api/v1/query', {
      method: 'POST',
      headers: this.headers(opts),
      body: new URLSearchParams({ query }),
      ...this.#callOpts(opts)
    });
  }

  async queryRange(query, start, end, step, opts = {}) {
    return this.service.request('/api/v1/query_range', {
      method: 'POST',
      headers: this.headers(opts),
      body: new URLSearchParams({ query, start, end, step }),
      ...this.#callOpts(opts)
    });
  }

  async labels(opts = {}) {
    return this.service.request('/api/v1/labels', {
      method: 'GET',
      headers: this.headers(opts),
      ...this.#callOpts(opts)
    });
  }

  async labelValues(labelName, opts = {}) {
    return this.service.request(`/api/v1/label/${labelName}/values`, {
      method: 'GET',
      headers: this.headers(opts),
      ...this.#callOpts(opts)
    });
  }

  async series(match, start, end, opts = {}) {
    if (!match) throw new GigapipeError('match parameter is required');
    if (typeof match === 'string') match = [match];

    const params = new URLSearchParams({ start, end });
    match.forEach(m => params.append('match[]', m));

    return this.service.request('/api/v1/series', {
      method: 'POST',
      headers: this.headers(opts),
      body: params,
      ...this.#callOpts(opts)
    });
  }

  async rules(opts = {}) {
    return this.service.request('/api/v1/rules', {
      method: 'GET',
      headers: this.headers(opts),
      ...this.#callOpts(opts)
    });
  }

  headers(opts = {}) {
    const headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
    const orgId = opts.orgId || this.options.orgId;
    if (orgId) headers['X-Scope-OrgID'] = orgId;
    return headers;
  }

  #callOpts(opts) {
    const { signal, timeoutMs, retry } = opts || {};
    const out = {};
    if (signal !== undefined) out.signal = signal;
    if (timeoutMs !== undefined) out.timeoutMs = timeoutMs;
    if (retry !== undefined) out.retry = retry;
    return out;
  }
}

class Prometheus {
  constructor(service) {
    this.service = service;
    this.protobufHandler = new Protobuff();
  }

  /**
   * @param {Metric[]} metrics
   * @param {Object} [options] orgId, async, fpLimit, ttlDays, signal, timeoutMs, retry
   */
  async push(metrics, options = {}) {
    let timeseries = [];
    if (!Array.isArray(metrics) || !metrics.every(m => {
      if (m instanceof Metric) {
        if (m.samples.length) timeseries.push(m.collect());
        return m;
      }
    })) {
      throw new GigapipeError('Metrics must be an array of Metric instances');
    }
    if (!timeseries.length) return;
    const writeRequest = { timeseries };

    const buffer = this.protobufHandler.encodeWriteRequest(writeRequest);
    const compressedBuffer = await this.protobufHandler.compressBuffer(buffer);

    const { signal, timeoutMs, retry, orgId } = options;

    return this.service.request('/api/v1/prom/remote/write', {
      method: 'POST',
      headers: this.headers(options),
      body: compressedBuffer,
      ...(signal !== undefined ? { signal } : {}),
      ...(timeoutMs !== undefined ? { timeoutMs } : {}),
      ...(retry !== undefined ? { retry } : {}),
      ...(orgId !== undefined ? { orgId } : {})
    }).then(res => {
      metrics.forEach(metric => metric.confirm());
      return res;
    }).catch(error => {
      metrics.forEach(metric => metric.undo());
      if (error instanceof GigapipeError) throw error;
      throw new GigapipeError(`Prometheus Remote Write push failed: ${error.message}`, error.statusCode);
    });
  }

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
