const GigapipeError = require('./gigapipeError');

/**
 * Thrown when a request is aborted via the caller's AbortSignal,
 * distinct from a per-attempt timeout (GigapipeTimeoutError).
 */
class GigapipeAbortedError extends GigapipeError {
  constructor(message, { reason, path } = {}) {
    super(message, null, undefined, path);
    this.name = 'GigapipeAbortedError';
    this.reason = reason;
  }
}

module.exports = GigapipeAbortedError;
