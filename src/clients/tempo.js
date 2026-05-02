'use strict';

const { QrynError } = require('../types');

/**
 * Tempo client — read-side access to traces stored in qryn.
 * @see https://grafana.com/docs/tempo/latest/api_docs/
 */
class TempoClient {
  /**
   * @param {import('../services/http')} service
   */
  constructor(service) {
    this.service = service;
  }

  /**
   * TraceQL search.
   * The first argument has three accepted shapes:
   *   - string: treated as a raw query string fragment (back-compat).
   *   - URLSearchParams: serialized directly (back-compat).
   *   - SearchOpts object: { q, start, end, limit, spss } — built into the query string.
   *
   * @param {string|URLSearchParams|{q:string,start?:Date|number,end?:Date|number,limit?:number,spss?:number}} [searchParams]
   * @param {Object} [options]
   * @param {string} [options.orgId]
   * @param {AbortSignal} [options.signal]
   * @param {number} [options.timeoutMs]
   * @param {Object} [options.retry]
   */
  async search(searchParams, options = {}) {
    const qs = this.#searchParamsToString(searchParams);
    return this.#get(`/api/search${qs ? `?${qs}` : ''}`, options, 'search');
  }

  /**
   * GET /api/search/tags
   * @param {'span'|'resource'|'intrinsic'} [scope]
   * @param {Object} [options] - opts.signal/timeoutMs/retry/orgId
   */
  async searchTags(scope, options = {}) {
    const path = scope ? `/api/search/tags?scope=${encodeURIComponent(scope)}` : '/api/search/tags';
    return this.#get(path, options, 'searchTags');
  }

  /**
   * GET /api/search/tag/{tag}/values  (v1)
   */
  async searchTagValues(tagName, options = {}) {
    if (!tagName) throw new QrynError('tagName is required');
    return this.#get(
      `/api/search/tag/${encodeURIComponent(tagName)}/values`,
      options,
      'searchTagValues'
    );
  }

  /**
   * GET /api/v2/search/tag/{tagName}/values
   */
  async searchTagValuesV2(tagName, searchParams, options = {}) {
    const qs = this.#searchParamsToString(searchParams);
    const path = `/api/v2/search/tag/${encodeURIComponent(tagName)}/values${qs ? `?${qs}` : ''}`;
    return this.#get(path, options, 'searchTagValuesV2');
  }

  /**
   * GET /api/traces/{traceId}/json
   * Existing method — kept for back-compat.
   */
  async getTraceSpansJson(traceID, options = {}) {
    return this.#get(`/api/traces/${encodeURIComponent(traceID)}/json`, options, 'getTraceSpansJson');
  }

  /**
   * Spec-aligned alias of getTraceSpansJson.
   */
  async getTrace(traceID, options = {}) {
    return this.getTraceSpansJson(traceID, options);
  }

  // -- helpers --

  #searchParamsToString(input) {
    if (input == null) return '';
    if (typeof input === 'string') return input;
    if (input instanceof URLSearchParams) return input.toString();
    if (typeof input === 'object') {
      const params = new URLSearchParams();
      if (input.q !== undefined)     params.set('q', input.q);
      if (input.start !== undefined) params.set('start', String(input.start instanceof Date ? input.start.getTime() : input.start));
      if (input.end !== undefined)   params.set('end',   String(input.end   instanceof Date ? input.end.getTime()   : input.end));
      if (input.limit !== undefined) params.set('limit', String(input.limit));
      if (input.spss !== undefined)  params.set('spss',  String(input.spss));
      return params.toString();
    }
    return String(input);
  }

  #headers(options) {
    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    };
    if (options.orgId) headers['X-Scope-OrgID'] = options.orgId;
    return headers;
  }

  async #get(path, options, verb) {
    return this.service.request(path, {
      method: 'GET',
      headers: this.#headers(options),
      signal: options.signal,
      timeoutMs: options.timeoutMs,
      retry: options.retry,
      orgId: options.orgId
    }).catch(error => {
      if (error instanceof QrynError) throw error;
      throw new QrynError(`Tempo ${verb} failed: ${error.message}`, error.statusCode);
    });
  }
}

module.exports = TempoClient;
