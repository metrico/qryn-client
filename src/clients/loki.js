const { GigapipeError } = require('../types');
const { Stream } = require('../models');
const Http = require('../services/http');

class Read {
  constructor(service, options) {
    this.service = service;
    this.options = options;
  }

  /**
   * Execute a LogQL query and retrieve log results.
   * @param {string} query - The LogQL query string.
   * @param {Object} [queryOptions={}] - Additional options for the query.
   * @param {number} [queryOptions.limit] - The maximum number of entries to return.
   * @param {number} [queryOptions.start] - The start timestamp in nanoseconds (Unix epoch).
   * @param {number} [queryOptions.end] - The end timestamp in nanoseconds (Unix epoch).
   * @param {boolean} [queryOptions.parse=false] - If true, returns parsed logs array instead of raw response.
   * @returns {Promise<GigapipeResponse|Array>} A promise that resolves to the response from the query endpoint, or parsed logs array if parse option is true.
   * @throws {GigapipeError} If the query request fails.
   */
  async query(query, queryOptions = {}) {
    if (!query) {
      throw new GigapipeError('Query parameter is required');
    }

    const params = new URLSearchParams({ query });
    if (queryOptions.limit) params.append('limit', queryOptions.limit);
    if (queryOptions.start) params.append('start', queryOptions.start);
    if (queryOptions.end) params.append('end', queryOptions.end);

    const result = await this.service.request(`/loki/api/v1/query?${params.toString()}`, {
      method: 'GET',
      headers: this.headers()
    }).catch(error => {
      if (error instanceof GigapipeError) {
        throw error;
      }
      throw new GigapipeError(`Loki query failed: ${error.message}`, error.statusCode);
    });

    if (queryOptions.parse) {
      return Loki.parseLogs(result);
    }

    return result;
  }

  /**
   * Execute a LogQL query over a range of time.
   * @param {string} query - The LogQL query string.
   * @param {number} start - The start timestamp in nanoseconds (Unix epoch).
   * @param {number} end - The end timestamp in nanoseconds (Unix epoch).
   * @param {Object} [queryOptions={}] - Additional options for the query.
   * @param {number} [queryOptions.step] - The query resolution step width in nanoseconds.
   * @param {number} [queryOptions.limit] - The maximum number of entries to return.
   * @param {boolean} [queryOptions.parse=false] - If true, returns parsed logs array instead of raw response.
   * @returns {Promise<GigapipeResponse|Array>} A promise that resolves to the response from the query range endpoint, or parsed logs array if parse option is true.
   * @throws {GigapipeError} If the query range request fails.
   */
  async queryRange(query, start, end, queryOptions = {}) {
    if (!query) {
      throw new GigapipeError('Query parameter is required');
    }
    if (!start || !end) {
      throw new GigapipeError('Start and end timestamps are required');
    }

    const params = new URLSearchParams({ query, start, end });
    if (queryOptions.step) params.append('step', queryOptions.step);
    if (queryOptions.limit) params.append('limit', queryOptions.limit);

    const result = await this.service.request(`/loki/api/v1/query_range?${params.toString()}`, {
      method: 'GET',
      headers: this.headers()
    }).catch(error => {
      if (error instanceof GigapipeError) {
        throw error;
      }
      throw new GigapipeError(`Loki query range failed: ${error.message}`, error.statusCode);
    });

    if (queryOptions.parse) {
      return Loki.parseLogs(result);
    }

    return result;
  }

  /**
   * Retrieve the list of label names.
   * @param {Object} [queryOptions={}] - Additional options for the request.
   * @param {number} [queryOptions.start] - The start timestamp in nanoseconds (Unix epoch).
   * @param {number} [queryOptions.end] - The end timestamp in nanoseconds (Unix epoch).
   * @returns {Promise<GigapipeResponse>} A promise that resolves to the response from the labels endpoint.
   * @throws {GigapipeError} If the labels request fails.
   */
  async labels(queryOptions = {}) {
    const params = new URLSearchParams();
    if (queryOptions.start) params.append('start', queryOptions.start);
    if (queryOptions.end) params.append('end', queryOptions.end);

    const queryString = params.toString();
    const url = `/loki/api/v1/labels${queryString ? `?${queryString}` : ''}`;

    return this.service.request(url, {
      method: 'GET',
      headers: this.headers()
    }).catch(error => {
      if (error instanceof GigapipeError) {
        throw error;
      }
      throw new GigapipeError(`Loki labels retrieval failed: ${error.message}`, error.statusCode);
    });
  }

  /**
   * Retrieve the list of label values for a specific label name.
   * @param {string} labelName - The name of the label.
   * @param {Object} [queryOptions={}] - Additional options for the request.
   * @param {number} [queryOptions.start] - The start timestamp in nanoseconds (Unix epoch).
   * @param {number} [queryOptions.end] - The end timestamp in nanoseconds (Unix epoch).
   * @returns {Promise<GigapipeResponse>} A promise that resolves to the response from the label values endpoint.
   * @throws {GigapipeError} If the label values request fails.
   */
  async labelValues(labelName, queryOptions = {}) {
    if (!labelName) {
      throw new GigapipeError('Label name parameter is required');
    }

    const params = new URLSearchParams();
    if (queryOptions.start) params.append('start', queryOptions.start);
    if (queryOptions.end) params.append('end', queryOptions.end);

    const queryString = params.toString();
    const url = `/loki/api/v1/label/${labelName}/values${queryString ? `?${queryString}` : ''}`;

    return this.service.request(url, {
      method: 'GET',
      headers: this.headers()
    }).catch(error => {
      if (error instanceof GigapipeError) {
        throw error;
      }
      throw new GigapipeError(`Loki label values retrieval failed: ${error.message}`, error.statusCode);
    });
  }

  /**
   * Retrieve the list of series that match a specified label set.
   * @param {string[]|string} match - The label matchers (e.g., ['{job="api"}', '{env="prod"}'] or '{job="api"}')
   * @param {Object} [queryOptions={}] - Additional options for the request.
   * @param {number} [queryOptions.start] - The start timestamp in nanoseconds (Unix epoch).
   * @param {number} [queryOptions.end] - The end timestamp in nanoseconds (Unix epoch).
   * @returns {Promise<GigapipeResponse>} A promise that resolves to the response from the series endpoint.
   * @throws {GigapipeError} If the series request fails.
   */
  async series(match, queryOptions = {}) {
    if (!match) {
      throw new GigapipeError('Match parameter is required');
    }

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
      headers: this.headers()
    }).catch(error => {
      if (error instanceof GigapipeError) {
        throw error;
      }
      throw new GigapipeError(`Loki series retrieval failed: ${error.message}`, error.statusCode);
    });
  }

  headers() {
    const headers = {};
    if (this.options.orgId) headers['X-Scope-OrgID'] = this.options.orgId;
    return headers;
  }
}

class Loki {
  /**
   * Create a new Loki instance.
   * @param {Http} service - The HTTP service to use for requests.
   */
  constructor(service) {
    this.service = service;
  }

  /**
   * Push streams to Loki.
   * @param {Stream[]} streams - An array of Stream instances to push.
   * @param {Object} options - Additional options for the request.
   * @param {string} options.orgId - The organization ID for the request.
   * @returns {Promise<Object>} The response from the Loki API.
   * @throws {GigapipeError} If the push fails or if the input is invalid.
   */
  async push(streams, options = {}) {

    let payload = { streams: []}
    if (!Array.isArray(streams) || !streams.every(s => {
        if(s instanceof Stream){
          if(s.entries.length)
            payload.streams.push(s.collect())
            return s;
        }
      
    })) {
      throw new GigapipeError('Streams must be an array of Stream instances');
    }
    const headers = this.headers(options);

    try {
      const response = await this.service.request('/loki/api/v1/push', {
        method: 'POST',
        headers,
        body: JSON.stringify(payload)
      });

      streams.forEach(s => s.confirm());
      return response;
    } catch (error) {
      streams.forEach(s => s.undo());
      if (error instanceof GigapipeError) {
        throw error;
      }
      throw new GigapipeError(`Loki push failed: ${error.message}`, error.statusCode);
    }
  }

  /**
   * Create a new Read instance for reading logs from Loki.
   * @param {Object} options - Options for the read operation.
   * @param {string} [options.orgId] - The organization ID to include in the request headers.
   * @returns {Read} A new Read instance.
   */
  createReader(options) {
    return new Read(this.service, options);
  }

  /**
   * Parse query or queryRange result and extract all logs as a flat array.
   * Works with both "streams" (query) and "matrix" (queryRange) result types.
   * @param {GigapipeResponse} result - The response from query or queryRange.
   * @returns {Array} Array of log objects with timestamp, date, and message (always parsed).
   */
  parseLogs(result) {
    return Loki.parseLogs(result);
  }

  /**
   * Static method to parse query or queryRange result and extract all logs as a flat array.
   * Works with both "streams" (query) and "matrix" (queryRange) result types.
   * @param {GigapipeResponse} result - The response from query or queryRange.
   * @returns {Array} Array of log objects with timestamp, date, and message (always parsed).
   */
  static parseLogs(result) {
    const logs = [];

    if (!result?.response?.data?.result) {
      return logs;
    }

    const resultType = result.response.data.resultType;
    const results = result.response.data.result;

    if (resultType === 'streams') {
      // query() returns streams format
      results.forEach((stream) => {
        if (!stream.values) return;

        stream.values.forEach((entry) => {
          if (!Array.isArray(entry) || entry.length < 2) return;

          const [timestampNs, message] = entry;

          // Convert nanoseconds to milliseconds
          const timestampMs = parseInt(timestampNs) / 1000000;
          const date = new Date(timestampMs);

          // Try to parse message as JSON, fallback to string
          let parsedMessage;
          try {
            parsedMessage = JSON.parse(message);
          } catch (e) {
            parsedMessage = message;
          }

          logs.push({
            timestamp: timestampNs,
            timestampMs: timestampMs,
            date: date,
            dateISO: date.toISOString(),
            message: parsedMessage,
            labels: stream.stream || {}
          });
        });
      });
    } else if (resultType === 'matrix') {
      // queryRange() returns matrix format
      results.forEach((series) => {
        if (!series.values) return;

        series.values.forEach((bucket) => {
          const [, logEntries] = bucket;

          // Handle single entry or array of entries
          const entries = Array.isArray(logEntries) && Array.isArray(logEntries[0])
              ? logEntries  // Multiple entries in this bucket
              : [logEntries]; // Single entry in this bucket

          entries.forEach((entry) => {
            if (!Array.isArray(entry) || entry.length < 2) return;

            const [timestampNs, message] = entry;

            // Convert nanoseconds to milliseconds
            const timestampMs = parseInt(timestampNs) / 1000000;
            const date = new Date(timestampMs);

            // Try to parse message as JSON, fallback to string
            let parsedMessage;
            try {
              parsedMessage = JSON.parse(message);
            } catch (e) {
              parsedMessage = message;
            }

            logs.push({
              timestamp: timestampNs,
              timestampMs: timestampMs,
              date: date,
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