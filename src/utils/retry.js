const RETRYABLE_STATUSES = new Set([408, 429, 502, 503, 504]);
const RETRYABLE_NETWORK_CODES = new Set(['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'EAI_AGAIN']);

const DEFAULT_RETRY_OPTIONS = {
  attempts: 3,
  baseDelayMs: 200,
  maxDelayMs: 5000
};

/**
 * Exponential backoff with full jitter.
 * delay = floor(random() * min(maxDelayMs, baseDelayMs * 2^(attempt-1)))
 *
 * @param {number} attempt 1-indexed attempt number
 * @param {number} baseDelayMs
 * @param {number} maxDelayMs
 * @returns {number} delay in ms
 */
function computeBackoffMs(attempt, baseDelayMs, maxDelayMs) {
  const exp = Math.min(maxDelayMs, baseDelayMs * Math.pow(2, attempt - 1));
  return Math.floor(Math.random() * exp);
}

function isRetryableStatus(status) {
  return RETRYABLE_STATUSES.has(status);
}

function isRetryableNetworkError(err) {
  if (!err) return false;
  const code = err.code || (err.cause && err.cause.code);
  return RETRYABLE_NETWORK_CODES.has(code);
}

/**
 * Parse a Retry-After header value to ms-from-now.
 * Accepts delta-seconds OR HTTP-date.
 * Returns null when unparseable.
 */
function parseRetryAfterMs(headerValue) {
  if (headerValue === null || headerValue === undefined) return null;
  const v = String(headerValue).trim();
  if (v === '') return null;
  if (/^\d+$/.test(v)) return parseInt(v, 10) * 1000;
  const t = Date.parse(v);
  if (Number.isNaN(t)) return null;
  return Math.max(0, t - Date.now());
}

module.exports = {
  DEFAULT_RETRY_OPTIONS,
  computeBackoffMs,
  isRetryableStatus,
  isRetryableNetworkError,
  parseRetryAfterMs
};
