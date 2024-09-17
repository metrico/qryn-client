const QrynError = require("./qrynError");
const QrynResponse = require("./qrynResponse");

class NetworkError extends QrynError {
  constructor(message, options = {}) {
    super(message, options);
    this.name = 'NetworkError';
    this.statusCode = options.statusCode;
  }
}

class ValidationError extends QrynError {
  constructor(message, options = {}) {
    super(message, options);
    this.name = 'ValidationError';
    this.field = options.field;
  }
}

module.exports = {
  NetworkError,
  ValidationError,
  QrynError,
  QrynResponse
}