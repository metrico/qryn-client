'use strict';

const { URL } = require('url');
const {
  QrynError,
  QrynAbortedError,
  QrynTimeoutError,
  QrynResponse
} = require('../types');
const { resolveAuthHeaders } = require('./auth');
const { anySignal } = require('../utils/abort');

/**
 * Handles HTTP requests for QrynClient.
 */
class Http {
  /**
   * @param {string} baseUrl
   * @param {number} timeout - default per-request timeout in ms.
   * @param {Object} headers - default headers, merged before auth.
   * @param {import('./auth').QrynAuth|undefined} auth
   * @param {Object} [opts]
   * @param {import('../utils/retry').RetryOptions} [opts.retry]
   * @param {string} [opts.defaultOrgId]
   * @param {typeof globalThis.fetch} [fetchImpl] - injected for testing.
   */
  constructor(baseUrl, timeout, headers, auth, opts = {}, fetchImpl = globalThis.fetch) {
    this.baseUrl = new URL(baseUrl);
    this.timeout = timeout;
    this.headers = headers;
    this.auth = auth;
    this.defaultRetry = opts.retry;
    this.defaultOrgId = opts.defaultOrgId;
    this.fetchImpl = fetchImpl;
  }

  /**
   * @param {string} path
   * @param {Object} [options]
   * @param {string} [options.method]
   * @param {Object} [options.headers]
   * @param {*} [options.body]
   * @param {AbortSignal} [options.signal]
   * @param {number} [options.timeoutMs]
   * @param {string} [options.orgId]
   * @returns {Promise<QrynResponse>}
   */
  async request(path, options = {}) {
    const url = new URL(path, this.baseUrl);
    const effectiveTimeout = options.timeoutMs ?? this.timeout;

    const authHeaders = await resolveAuthHeaders(this.auth);
    const orgId = options.orgId ?? this.defaultOrgId;

    const headers = {
      ...this.headers,
      ...options.headers,
      ...authHeaders
    };
    if (orgId) headers['X-Scope-OrgID'] = orgId;

    const timeoutSignal = AbortSignal.timeout(effectiveTimeout);
    const signal = options.signal
      ? anySignal([options.signal, timeoutSignal])
      : timeoutSignal;

    const startedAt = Date.now();
    let response;
    try {
      response = await this.fetchImpl(url.toString(), {
        method: options.method,
        headers,
        body: options.body,
        signal
      });
    } catch (error) {
      if (error && error.name === 'AbortError') {
        if (options.signal && options.signal.aborted) {
          throw new QrynAbortedError(
            'Request aborted by caller',
            options.signal.reason,
            path
          );
        }
        throw new QrynTimeoutError(
          `Request timed out after ${effectiveTimeout}ms`,
          Date.now() - startedAt,
          path
        );
      }
      throw new QrynError(
        `Request failed: ${error.message} ${error?.cause?.message ?? ''}`.trim(),
        400,
        error.cause,
        path
      );
    }

    let body = {};
    const ct = (response.headers && response.headers.get && response.headers.get('content-type')) || '';
    if (response.status !== 204) {
      if (ct.includes('application/json')) {
        body = await response.json().catch(() => ({}));
      } else if (ct) {
        const text = await response.text().catch(() => '');
        body = text || {};
      }
    }

    if (!response.ok) {
      throw new QrynError(`HTTP error! status: ${response.status}`, response.status, body, path);
    }

    return new QrynResponse(body, response.status, response.headers, path);
  }
}

module.exports = Http;
