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
   * @returns {Promise<Object>} The response from the Loki API.
   * @throws {QrynError} If the push fails or if the input is invalid.
   */
  async push(streams) {
    if (!Array.isArray(streams) || !streams.every(s => s instanceof Stream)) {
      throw new QrynError('Streams must be an array of Stream instances');
    }

    const payload = {
      streams: streams.map(s => ({
        labels: s.labels,
        entries: s.entries
      }))
    };

    try {
      return await this.service.request('/loki/api/v1/push', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
    } catch (error) {
      if (error instanceof QrynError) {
        throw error;
      }
      throw new QrynError(`Loki push failed: ${error.message}`, error.statusCode);
    }
  }
}

module.exports = Loki;