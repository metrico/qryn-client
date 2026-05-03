const { GigapipeError } = require('../types');
const { Stream } = require('../models');

class Read {
  constructor(service, options) {
    this.service = service;
    this.options = options || {};
  }

  /**
   * Execute a LogQL query.
   * @param {string} query
   * @param {Object} [queryOptions]
   * @param {Object} [opts] ReadOpts: { signal, timeoutMs, retry, orgId }
   */
  async query(query, queryOptions = {}, opts = {}) {
    if (!query) throw new GigapipeError('Query parameter is required');

    const params = new URLSearchParams({ query });
    if (queryOptions.limit) params.append('limit', queryOptions.limit);
    if (queryOptions.start) params.append('start', queryOptions.start);
    if (queryOptions.end) params.append('end', queryOptions.end);

    const result = await this.service.request(`/loki/api/v1/query?${params.toString()}`, {
      method: 'GET',
      headers: this.headers(opts),
      ...this.#callOpts(opts)
    });

    if (queryOptions.parse) return Loki.parseLogs(result);
    return result;
  }

  async queryRange(query, start, end, queryOptions = {}, opts = {}) {
    if (!query) throw new GigapipeError('Query parameter is required');
    if (!start || !end) throw new GigapipeError('Start and end timestamps are required');

    const params = new URLSearchParams({ query, start, end });
    if (queryOptions.step) params.append('step', queryOptions.step);
    if (queryOptions.limit) params.append('limit', queryOptions.limit);

    const result = await this.service.request(`/loki/api/v1/query_range?${params.toString()}`, {
      method: 'GET',
      headers: this.headers(opts),
      ...this.#callOpts(opts)
    });

    if (queryOptions.parse) return Loki.parseLogs(result);
    return result;
  }

  async labels(queryOptions = {}, opts = {}) {
    const params = new URLSearchParams();
    if (queryOptions.start) params.append('start', queryOptions.start);
    if (queryOptions.end) params.append('end', queryOptions.end);

    const qs = params.toString();
    return this.service.request(`/loki/api/v1/labels${qs ? `?${qs}` : ''}`, {
      method: 'GET',
      headers: this.headers(opts),
      ...this.#callOpts(opts)
    });
  }

  async labelValues(labelName, queryOptions = {}, opts = {}) {
    if (!labelName) throw new GigapipeError('Label name parameter is required');

    const params = new URLSearchParams();
    if (queryOptions.start) params.append('start', queryOptions.start);
    if (queryOptions.end) params.append('end', queryOptions.end);

    const qs = params.toString();
    return this.service.request(`/loki/api/v1/label/${labelName}/values${qs ? `?${qs}` : ''}`, {
      method: 'GET',
      headers: this.headers(opts),
      ...this.#callOpts(opts)
    });
  }

  async series(match, queryOptions = {}, opts = {}) {
    if (!match) throw new GigapipeError('Match parameter is required');

    const params = new URLSearchParams();
    if (queryOptions.start) params.append('start', queryOptions.start);
    if (queryOptions.end) params.append('end', queryOptions.end);

    if (typeof match === 'string') {
      params.append('match[]', match);
    } else if (Array.isArray(match)) {
      match.forEach(m => params.append('match[]', m));
    } else {
      throw new GigapipeError('Match must be a string or array of strings');
    }

    return this.service.request(`/loki/api/v1/series?${params.toString()}`, {
      method: 'GET',
      headers: this.headers(opts),
      ...this.#callOpts(opts)
    });
  }

  headers(opts = {}) {
    const headers = {};
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

class Loki {
  constructor(service) {
    this.service = service;
  }

  /**
   * Push streams to Loki.
   * @param {Stream[]} streams
   * @param {Object} [options] orgId, async, fpLimit, ttlDays, signal, timeoutMs, retry
   */
  async push(streams, options = {}) {
    let payload = { streams: [] };
    if (!Array.isArray(streams) || !streams.every(s => {
      if (s instanceof Stream) {
        if (s.entries.length) payload.streams.push(s.collect());
        return s;
      }
    })) {
      throw new GigapipeError('Streams must be an array of Stream instances');
    }
    const headers = this.headers(options);
    const { signal, timeoutMs, retry, orgId } = options;

    try {
      const response = await this.service.request('/loki/api/v1/push', {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        ...(signal !== undefined ? { signal } : {}),
        ...(timeoutMs !== undefined ? { timeoutMs } : {}),
        ...(retry !== undefined ? { retry } : {}),
        ...(orgId !== undefined ? { orgId } : {})
      });
      streams.forEach(s => s.confirm());
      return response;
    } catch (error) {
      streams.forEach(s => s.undo());
      if (error instanceof GigapipeError) throw error;
      throw new GigapipeError(`Loki push failed: ${error.message}`, error.statusCode);
    }
  }

  /**
   * @param {Object} [options] - { orgId? }
   * @returns {Read}
   */
  createReader(options) {
    return new Read(this.service, options);
  }

  parseLogs(result) {
    return Loki.parseLogs(result);
  }

  static parseLogs(result) {
    const logs = [];
    if (!result?.response?.data?.result) return logs;

    const resultType = result.response.data.resultType;
    const results = result.response.data.result;

    if (resultType === 'streams') {
      results.forEach((stream) => {
        if (!stream.values) return;
        stream.values.forEach((entry) => {
          if (!Array.isArray(entry) || entry.length < 2) return;
          const [timestampNs, message] = entry;
          const timestampMs = parseInt(timestampNs) / 1000000;
          const date = new Date(timestampMs);
          let parsedMessage;
          try { parsedMessage = JSON.parse(message); } catch (e) { parsedMessage = message; }
          logs.push({
            timestamp: timestampNs,
            timestampMs,
            date,
            dateISO: date.toISOString(),
            message: parsedMessage,
            labels: stream.stream || {}
          });
        });
      });
    } else if (resultType === 'matrix') {
      results.forEach((series) => {
        if (!series.values) return;
        series.values.forEach((bucket) => {
          const [, logEntries] = bucket;
          const entries = Array.isArray(logEntries) && Array.isArray(logEntries[0])
            ? logEntries
            : [logEntries];
          entries.forEach((entry) => {
            if (!Array.isArray(entry) || entry.length < 2) return;
            const [timestampNs, message] = entry;
            const timestampMs = parseInt(timestampNs) / 1000000;
            const date = new Date(timestampMs);
            let parsedMessage;
            try { parsedMessage = JSON.parse(message); } catch (e) { parsedMessage = message; }
            logs.push({
              timestamp: timestampNs,
              timestampMs,
              date,
              dateISO: date.toISOString(),
              message: parsedMessage,
              labels: series.metric || {}
            });
          });
        });
      });
    }

    return logs;
  }

  headers(options = {}) {
    const headers = {};
    if (options.orgId) headers['X-Scope-OrgID'] = options.orgId;
    if (options.async) headers['X-Async-Insert'] = options.async;
    if (options.fpLimit) headers['X-Ttl-Days'] = options.fpLimit;
    if (options.ttlDays) headers['X-FP-LIMIT'] = options.ttlDays;
    return headers;
  }
}

module.exports = Loki;
