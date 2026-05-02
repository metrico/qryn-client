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
const {
  DEFAULT_RETRY,
  computeBackoff,
  parseRetryAfter,
  isRetryableStatus,
  isRetryableNetworkError
} = require('../utils/retry');

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

  async request(path, options = {}) {
    const retryOpts = { ...DEFAULT_RETRY, ...this.defaultRetry, ...options.retry };
    const attempts = Math.max(1, retryOpts.attempts);

    let lastError;
    for (let attempt = 1; attempt <= attempts; attempt++) {
      if (options.signal && options.signal.aborted) {
        throw new QrynAbortedError('Request aborted by caller', options.signal.reason, path);
      }
      try {
        return await this.#singleRequest(path, options);
      } catch (error) {
        lastError = error;

        // Caller abort: never retry.
        if (error instanceof QrynAbortedError) throw error;

        const isLast = attempt === attempts;
        if (isLast) throw error;

        let delayMs;
        if (error instanceof QrynError && typeof error.statusCode === 'number') {
          const retryAfterFromCustom = retryOpts.retryOn
            ? retryOpts.retryOn(error.statusCode, attempt)
            : isRetryableStatus(error.statusCode);
          if (!retryAfterFromCustom) throw error;

          const headerVal = error.cause && error.cause.headers
            ? error.cause.headers.get && error.cause.headers.get('retry-after')
            : null;
          const fromHeader = error.statusCode === 429 ? parseRetryAfter(headerVal) : null;
          delayMs = fromHeader != null ? fromHeader : computeBackoff(attempt, retryOpts);
        } else if (isRetryableNetworkError(error) || (error instanceof QrynError && error.cause && isRetryableNetworkError(error.cause))) {
          delayMs = computeBackoff(attempt, retryOpts);
        } else {
          throw error;
        }

        await this.#sleep(delayMs, options.signal);
      }
    }
    throw lastError;
  }

  async #singleRequest(path, options) {
    const url = new URL(path, this.baseUrl);
    const effectiveTimeout = options.timeoutMs ?? this.timeout;

    const authHeaders = await resolveAuthHeaders(this.auth);
    const orgId = options.orgId ?? this.defaultOrgId;

    const headers = { ...this.headers, ...options.headers, ...authHeaders };
    if (orgId) headers['X-Scope-OrgID'] = orgId;

    const timeoutSignal = AbortSignal.timeout(effectiveTimeout);
    const signal = options.signal ? anySignal([options.signal, timeoutSignal]) : timeoutSignal;

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
          throw new QrynAbortedError('Request aborted by caller', options.signal.reason, path);
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
      const cause = { headers: response.headers, body };
      throw new QrynError(`HTTP error! status: ${response.status}`, response.status, cause, path);
    }

    return new QrynResponse(body, response.status, response.headers, path);
  }

  #sleep(ms, signal) {
    return new Promise((resolve, reject) => {
      if (ms <= 0) return resolve();
      let onAbort;
      const timer = setTimeout(() => {
        if (signal && onAbort) signal.removeEventListener('abort', onAbort);
        resolve();
      }, ms);
      if (signal) {
        onAbort = () => {
          clearTimeout(timer);
          reject(new QrynAbortedError('Request aborted by caller', signal.reason));
        };
        signal.addEventListener('abort', onAbort, { once: true });
      }
    });
  }
}

module.exports = Http;
