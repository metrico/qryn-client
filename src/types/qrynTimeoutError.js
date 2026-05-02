const QrynError = require('./qrynError');

/**
 * Thrown when the per-request timeout (timeoutMs) elapses before the
 * fetch resolves. Distinct from QrynAbortedError (caller-driven) and
 * from network errors.
 */
class QrynTimeoutError extends QrynError {
  /**
   * @param {string} message
   * @param {number} elapsedMs
   * @param {string} [path]
   */
  constructor(message, elapsedMs, path) {
    super(message, null, undefined, path);
    this.name = 'QrynTimeoutError';
    this.elapsedMs = elapsedMs;
  }
}

module.exports = QrynTimeoutError;
