const { QrynError } = require('../types');
const { Stream } = require('../models');
const Http = require('../services/http');

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
   * @throws {QrynError} If the push fails or if the input is invalid.
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
      throw new QrynError('Streams must be an array of Stream instances');
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
      if (error instanceof QrynError) {
        throw error;
      }
      throw new QrynError(`Loki push failed: ${error.message}`, error.statusCode);
    }
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