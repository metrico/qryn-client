/**
 * Custom error class for GigapipeClient errors.
 */
class GigapipeError extends Error {
  constructor(message, statusCode = null, cause, path) {
    super(message);
    this.name = 'GigapipeError';
    this.statusCode = statusCode;
    this.cause = cause;
    this.path = path;
  }
}

module.exports = GigapipeError;