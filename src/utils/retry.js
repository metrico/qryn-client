'use strict';

const DEFAULT_RETRY = Object.freeze({
  attempts: 3,
  baseDelayMs: 200,
  maxDelayMs: 5000
});

const RETRYABLE_STATUS = new Set([408, 429, 502, 503, 504]);
const RETRYABLE_NET_CODES = new Set(['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'EAI_AGAIN']);

/**
 * Exponential backoff with full jitter.
 * delay = jitter * min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1))
 *
 * @param {number} attempt - 1-based attempt number that just failed.
 * @param {{ baseDelayMs: number, maxDelayMs: number }} opts
 * @param {() => number} [random=Math.random] - Injected for testing.
 * @returns {number} delay in milliseconds before the next attempt.
 */
function computeBackoff(attempt, opts, random = Math.random) {
  const exp = opts.baseDelayMs * Math.pow(2, attempt - 1);
  const capped = Math.min(opts.maxDelayMs, exp);
  return Math.floor(random() * capped);
}

/**
 * Parse a Retry-After header (RFC 7231).
 * @param {string|null|undefined} value
 * @returns {number|null} milliseconds to wait, or null if unparseable.
 */
function parseRetryAfter(value) {
  if (value == null) return null;
  const trimmed = String(value).trim();
  if (trimmed === '') return null;
  if (/^\d+$/.test(trimmed)) {
    return Number(trimmed) * 1000;
  }
  const ts = Date.parse(trimmed);
  if (Number.isNaN(ts)) return null;
  return Math.max(0, ts - Date.now());
}

/**
 * @param {number} status
 * @returns {boolean}
 */
function isRetryableStatus(status) {
  return RETRYABLE_STATUS.has(status);
}

/**
 * @param {{code?: string, cause?: {code?: string}} | null | undefined} err
 * @returns {boolean}
 */
function isRetryableNetworkError(err) {
  if (!err) return false;
  if (err.code && RETRYABLE_NET_CODES.has(err.code)) return true;
  if (err.cause && err.cause.code && RETRYABLE_NET_CODES.has(err.cause.code)) return true;
  return false;
}

module.exports = {
  DEFAULT_RETRY,
  computeBackoff,
  parseRetryAfter,
  isRetryableStatus,
  isRetryableNetworkError
};
