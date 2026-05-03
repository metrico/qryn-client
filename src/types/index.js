const GigapipeError = require('./gigapipeError');
const GigapipeResponse = require('./gigapipeResponse');
const GigapipeAbortedError = require('./gigapipeAbortedError');
const GigapipeTimeoutError = require('./gigapipeTimeoutError');

class NetworkError extends GigapipeError {
  constructor(message, options = {}) {
    super(message, options);
    this.name = 'NetworkError';
    this.statusCode = options.statusCode;
  }
}

class ValidationError extends GigapipeError {
  constructor(message, options = {}) {
    super(message, options);
    this.name = 'ValidationError';
    this.field = options.field;
  }
}

module.exports = {
  NetworkError,
  ValidationError,
  GigapipeError,
  GigapipeResponse,
  GigapipeAbortedError,
  GigapipeTimeoutError
};
