const { URL } = require('url');
const {
  GigapipeError,
  GigapipeResponse,
  GigapipeAbortedError,
  GigapipeTimeoutError
} = require('../types');
const { anySignal } = require('../utils/abort');
const {
  DEFAULT_RETRY_OPTIONS,
  computeBackoffMs,
  isRetryableStatus,
  isRetryableNetworkError,
  parseRetryAfterMs
} = require('../utils/retry');

/**
 * HTTP layer for GigapipeClient.
 *
 * Per-call request options (override instance defaults):
 *   - method, headers, body            (existing)
 *   - signal     — caller AbortSignal
 *   - timeoutMs  — per-attempt timeout (overrides instance timeout)
 *   - orgId      — sets X-Scope-OrgID header (overrides instance/default)
 *   - retry      — RetryOptions; overrides instance defaultRetry
 *   - authResolver — async () => Record<string,string>; overrides resolved auth headers
 */
class Http {
  constructor(baseUrl, timeout, headers, auth) {
    this.baseUrl = new URL(baseUrl);
    this.timeout = timeout;
    this.headers = headers || {};
    this.auth = this.#normalizeAuth(auth);
  }

  /**
   * Normalize either the legacy {username,password} or the new
   * discriminated union to a single shape. Returns null when no auth.
   */
  #normalizeAuth(auth) {
    if (!auth) return null;
    if (auth.type === 'basic')  return { type: 'basic',  username: auth.username, password: auth.password };
    if (auth.type === 'bearer') return { type: 'bearer', token: auth.token };
    if (auth.type === 'custom') return { type: 'custom', headers: auth.headers };
    if (auth.username !== undefined && auth.password !== undefined) {
      return { type: 'basic', username: auth.username, password: auth.password };
    }
    return null;
  }

  async #resolveAuthHeaders() {
    if (!this.auth) return {};
    if (this.auth.type === 'basic') {
      const b64 = Buffer.from(`${this.auth.username}:${this.auth.password}`).toString('base64');
      return { Authorization: `Basic ${b64}` };
    }
    if (this.auth.type === 'bearer') {
      const token = typeof this.auth.token === 'function' ? await this.auth.token() : this.auth.token;
      return { Authorization: `Bearer ${token}` };
    }
    if (this.auth.type === 'custom') {
      const h = typeof this.auth.headers === 'function' ? await this.auth.headers() : this.auth.headers;
      return { ...(h || {}) };
    }
    return {};
  }

  /** Make an HTTP request, retrying as configured. */
  async request(path, options = {}) {
    const retry = { ...DEFAULT_RETRY_OPTIONS, ...(this.defaultRetry || {}), ...(options.retry || {}) };
    const callerSignal = options.signal;
    let lastError;

    for (let attempt = 1; attempt <= retry.attempts; attempt++) {
      if (callerSignal && callerSignal.aborted) {
        throw new GigapipeAbortedError('Request aborted', { reason: callerSignal.reason, path });
      }
      try {
        return await this.#requestOnce(path, options);
      } catch (err) {
        lastError = err;
        if (err instanceof GigapipeAbortedError) throw err;
        if (attempt >= retry.attempts) throw err;

        const shouldRetry = (typeof retry.retryOn === 'function')
          ? retry.retryOn(err.statusCode || 0, attempt)
          : (isRetryableStatus(err.statusCode) || isRetryableNetworkError(err.cause) || isRetryableNetworkError(err));
        if (!shouldRetry) throw err;

        const retryAfterRaw = err.headers && typeof err.headers.get === 'function'
          ? err.headers.get('retry-after')
          : null;
        const retryAfter = parseRetryAfterMs(retryAfterRaw);
        const delayMs = (retryAfter !== null && retryAfter !== undefined)
          ? retryAfter
          : computeBackoffMs(attempt, retry.baseDelayMs, retry.maxDelayMs);
        await this.#sleep(delayMs, callerSignal);
      }
    }
    throw lastError;
  }

  #sleep(ms, callerSignal) {
    return new Promise((resolve, reject) => {
      const t = setTimeout(resolve, ms);
      if (callerSignal) {
        callerSignal.addEventListener('abort', () => {
          clearTimeout(t);
          reject(new GigapipeAbortedError('Request aborted during backoff', { reason: callerSignal.reason }));
        }, { once: true });
      }
    });
  }

  /** Single-shot HTTP request. Throws GigapipeError/GigapipeAbortedError/GigapipeTimeoutError. */
  async #requestOnce(path, options = {}) {
    const url = new URL(path, this.baseUrl);

    const callerSignal = options.signal;
    const timeoutMs = options.timeoutMs ?? this.timeout;
    const timeoutSignal = AbortSignal.timeout(timeoutMs);
    const combinedSignal = anySignal([callerSignal, timeoutSignal]);

    const headers = { ...this.headers, ...options.headers };
    if (options.orgId) headers['X-Scope-OrgID'] = options.orgId;

    const authHeaders = await (options.authResolver
      ? options.authResolver()
      : this.#resolveAuthHeaders());
    Object.assign(headers, authHeaders);

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
      const e = new GigapipeError(`HTTP error! status: ${response.status}`, response.status, res, path);
      e.headers = response.headers;
      throw e;
    }

    return new GigapipeResponse(res, response.status, response.headers, path);
  }
}

module.exports = Http;
