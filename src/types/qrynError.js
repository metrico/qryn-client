/**
 * Custom error class for QrynClient errors.
 */
class QrynError extends Error {
  constructor(message, statusCode = null, cause, path) {
    super(message);
    this.name = 'QrynError';
    this.statusCode = statusCode;
    this.cause = cause;
    this.path = path;
  }
}
module.exports = QrynError;