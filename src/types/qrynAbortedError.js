const QrynError = require('./qrynError');

/**
 * Thrown when a request is aborted by a caller-supplied AbortSignal.
 * Distinct from QrynTimeoutError (which signals the request's own timeout fired)
 * and from network errors.
 */
class QrynAbortedError extends QrynError {
  /**
   * @param {string} message
   * @param {*} [reason] - The AbortSignal.reason at abort time, if any.
   * @param {string} [path]
   */
  constructor(message, reason, path) {
    super(message, null, reason, path);
    this.name = 'QrynAbortedError';
    this.reason = reason;
  }
}

module.exports = QrynAbortedError;
