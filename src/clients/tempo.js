const { GigapipeError } = require('../types');

class TempoClient {
  /**
   * @param {Http} service
   */
  constructor(service) {
    this.service = service;
  }

  /**
   * TraceQL search.
   * @param {string|URLSearchParams} [searchParams]
   * @param {Object} [opts] ReadOpts
   */
  async search(searchParams, opts = {}) {
    const qs = (searchParams instanceof URLSearchParams)
      ? searchParams.toString()
      : (searchParams || '');
    return this.service.request(`/api/search${qs ? '?' + qs : ''}`, {
      method: 'GET',
      headers: this.headers(opts),
      ...this.#callOpts(opts)
    });
  }

  /**
   * List discovered tags. Optional scope: 'span' | 'resource' | 'intrinsic'.
   */
  async searchTags(scope, opts = {}) {
    const qs = scope ? `?scope=${encodeURIComponent(scope)}` : '';
    return this.service.request(`/api/search/tags${qs}`, {
      method: 'GET',
      headers: this.headers(opts),
      ...this.#callOpts(opts)
    });
  }

  /** v1 path /api/search/tag/{tag}/values */
  async searchTagValues(tag, opts = {}) {
    if (!tag) throw new GigapipeError('Tag parameter is required');
    return this.service.request(`/api/search/tag/${encodeURIComponent(tag)}/values`, {
      method: 'GET',
      headers: this.headers(opts),
      ...this.#callOpts(opts)
    });
  }

  /** Existing v2 path retained for back-compat. */
  async searchTagValuesV2(tagName, searchParams, opts = {}) {
    const qs = searchParams ? `?${searchParams}` : '';
    return this.service.request(`/api/v2/search/tag/${encodeURIComponent(tagName)}/values${qs}`, {
      method: 'GET',
      headers: this.headers(opts),
      ...this.#callOpts(opts)
    });
  }

  /** Spec alias on /api/traces/{id}. */
  async getTrace(traceId, opts = {}) {
    if (!traceId) throw new GigapipeError('traceId parameter is required');
    return this.service.request(`/api/traces/${encodeURIComponent(traceId)}`, {
      method: 'GET',
      headers: this.headers(opts),
      ...this.#callOpts(opts)
    });
  }

  /** Existing /api/traces/{id}/json retained for back-compat. */
  async getTraceSpansJson(traceID, opts = {}) {
    return this.service.request(`/api/traces/${encodeURIComponent(traceID)}/json`, {
      method: 'GET',
      headers: this.headers(opts),
      ...this.#callOpts(opts)
    });
  }

  headers(opts = {}) {
    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    };
    if (opts.orgId) headers['X-Scope-OrgID'] = opts.orgId;
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

module.exports = TempoClient;
