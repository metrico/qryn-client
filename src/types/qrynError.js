/**
 * Custom error class for QrynClient errors.
 */
class QrynError extends Error {
  constructor(message, statusCode = null, cause) {
    super(message);
    this.name = 'QrynError';
    this.statusCode = statusCode;
    this.cause = cause;
  }
}
module.exports = QrynError;