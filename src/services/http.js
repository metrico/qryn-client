const { URL } = require('url');
const {
  GigapipeError,
  GigapipeResponse,
  GigapipeAbortedError,
  GigapipeTimeoutError
} = require('../types');
const { anySignal } = require('../utils/abort');

/**
 * HTTP layer for GigapipeClient.
 *
 * Per-call request options (override instance defaults):
 *   - method, headers, body            (existing)
 *   - signal     — caller AbortSignal
 *   - timeoutMs  — per-attempt timeout (overrides instance timeout)
 *   - orgId      — sets X-Scope-OrgID header (overrides instance header)
 */
class Http {
  constructor(baseUrl, timeout, headers, auth) {
    this.baseUrl = new URL(baseUrl);
    this.timeout = timeout;
    this.headers = headers || {};
    this.#setBasicAuth(auth);
  }

  #setBasicAuth(auth) {
    if (auth && auth.username !== undefined && auth.password !== undefined) {
      this.basicAuth = Buffer.from(`${auth.username}:${auth.password}`).toString('base64');
    } else {
      this.basicAuth = null;
    }
  }

  /**
   * Make an HTTP request.
   * @param {string} path
   * @param {Object} options
   * @returns {Promise<GigapipeResponse>}
   * @throws {GigapipeError|GigapipeAbortedError|GigapipeTimeoutError}
   */
  async request(path, options = {}) {
    const url = new URL(path, this.baseUrl);

    const callerSignal = options.signal;
    const timeoutMs = options.timeoutMs ?? this.timeout;
    const timeoutSignal = AbortSignal.timeout(timeoutMs);
    const combinedSignal = anySignal([callerSignal, timeoutSignal]);

    const headers = { ...this.headers, ...options.headers };
    if (options.orgId) headers['X-Scope-OrgID'] = options.orgId;
    if (this.basicAuth) headers['Authorization'] = `Basic ${this.basicAuth}`;

    const { signal: _s, timeoutMs: _t, orgId: _o, retry: _r, authResolver: _a, ...rest } = options;
    const fetchOptions = { ...rest, headers, signal: combinedSignal };

    const startedAt = Date.now();
    let response;
    let res = {};
    try {
      response = await fetch(url.toString(), fetchOptions);
    } catch (error) {
      if (error && error.name === 'AbortError') {
        if (callerSignal && callerSignal.aborted) {
          throw new GigapipeAbortedError('Request aborted', { reason: callerSignal.reason, path });
        }
        throw new GigapipeTimeoutError(`Request timed out after ${timeoutMs}ms`, {
          elapsedMs: Date.now() - startedAt,
          path
        });
      }
      throw new GigapipeError(
        `Request failed: ${error.message}${error?.cause?.message ? ' ' + error.cause.message : ''}`,
        400,
        error.cause || error,
        path
      );
    }

    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      res = await response.json();
    } else if (response.status !== 204) {
      res = await response.text();
    }

    if (!response.ok) {
      throw new GigapipeError(`HTTP error! status: ${response.status}`, response.status, res, path);
    }

    return new GigapipeResponse(res, response.status, response.headers, path);
  }
}

module.exports = Http;
