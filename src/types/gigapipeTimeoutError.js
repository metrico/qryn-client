const GigapipeError = require('./gigapipeError');

/**
 * Thrown when a request attempt exceeds its timeoutMs budget.
 * Distinct from caller-initiated abort (GigapipeAbortedError).
 */
class GigapipeTimeoutError extends GigapipeError {
  constructor(message, { elapsedMs, path } = {}) {
    super(message, null, undefined, path);
    this.name = 'GigapipeTimeoutError';
    this.elapsedMs = elapsedMs;
  }
}

module.exports = GigapipeTimeoutError;
