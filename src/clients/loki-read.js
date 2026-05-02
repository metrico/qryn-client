'use strict';

const { QrynError } = require('../types');
const { toNanos } = require('../utils/time');

/**
 * Loki read client — LogQL queries, labels, label values, series.
 * @see https://grafana.com/docs/loki/latest/reference/loki-http-api/
 */
class LokiReader {
  /**
   * @param {import('../services/http')} service
   * @param {{ orgId?: string }} [options]
   */
  constructor(service, options = {}) {
    this.service = service;
    this.options = options;
  }

  /**
   * Instant LogQL query.
   * @param {string} query
   * @param {Date|number|string} [time]
   * @param {Object} [opts]
   */
  async query(query, time, opts = {}) {
    const params = new URLSearchParams();
    params.set('query', query);
    if (time !== undefined) params.set('time', toNanos(time));
    return this.#get('/loki/api/v1/query', params, opts, 'query');
  }

  /**
   * Range LogQL query.
   */
  async queryRange(query, start, end, step, limit, direction, opts = {}) {
    const params = new URLSearchParams();
    params.set('query', query);
    params.set('start', toNanos(start));
    params.set('end', toNanos(end));
    if (step !== undefined) params.set('step', String(step));
    if (limit !== undefined) params.set('limit', String(limit));
    if (direction !== undefined) params.set('direction', String(direction));
    return this.#get('/loki/api/v1/query_range', params, opts, 'queryRange');
  }

  /**
   * List label names.
   */
  async labels(start, end, opts = {}) {
    const params = new URLSearchParams();
    if (start !== undefined) params.set('start', toNanos(start));
    if (end !== undefined) params.set('end', toNanos(end));
    return this.#get('/loki/api/v1/labels', params, opts, 'labels');
  }

  /**
   * Values for a single label.
   */
  async labelValues(label, start, end, match, opts = {}) {
    if (!label) throw new QrynError('label parameter is required');
    const params = new URLSearchParams();
    if (start !== undefined) params.set('start', toNanos(start));
    if (end !== undefined) params.set('end', toNanos(end));
    if (match !== undefined) params.set('query', String(match));
    return this.#get(
      `/loki/api/v1/label/${encodeURIComponent(label)}/values`,
      params,
      opts,
      'labelValues'
    );
  }

  /**
   * Series matching one or more matchers.
   */
  async series(matchers, start, end, opts = {}) {
    if (!matchers) throw new QrynError('matchers parameter is required');
    const list = Array.isArray(matchers) ? matchers : [matchers];
    const params = new URLSearchParams();
    if (start !== undefined) params.set('start', toNanos(start));
    if (end !== undefined) params.set('end', toNanos(end));
    list.forEach(m => params.append('match[]', m));
    return this.#get('/loki/api/v1/series', params, opts, 'series');
  }

  async #get(basePath, params, opts, verb) {
    const qs = params.toString();
    const path = qs ? `${basePath}?${qs}` : basePath;
    return this.service.request(path, {
      method: 'GET',
      headers: this.#headers(opts),
      signal: opts.signal,
      timeoutMs: opts.timeoutMs,
      retry: opts.retry,
      orgId: opts.orgId ?? this.options.orgId
    }).catch(error => {
      if (error instanceof QrynError) throw error;
      throw new QrynError(`Loki ${verb} failed: ${error.message}`, error.statusCode);
    });
  }

  #headers(_opts) {
    return {
      'Accept': 'application/json'
    };
  }
}

module.exports = LokiReader;
