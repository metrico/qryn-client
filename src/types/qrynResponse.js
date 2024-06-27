/**
 * Represents a standardized response from the Qryn API.
 */
class QrynResponse {
  /**
   * Create a QrynResponse.
   * @param {Object} data - The response data from the API.
   * @param {number} status - The HTTP status code of the response.
   * @param {Object} headers - The headers of the response.
   */
  constructor(data, status, headers) {
    this.data = data;
    this.status = status;
    this.headers = headers;
  }

  /**
   * Check if the response was successful.
   * @returns {boolean} True if the status code is in the 2xx range.
   */
  isSuccess() {
    return this.status >= 200 && this.status < 300;
  }

  /**
   * Get the response data.
   * @returns {Object} The response data.
   */
  getData() {
    return this.data;
  }

  /**
   * Get the HTTP status code.
   * @returns {number} The HTTP status code.
   */
  getStatus() {
    return this.status;
  }

  /**
   * Get the response headers.
   * @returns {Object} The response headers.
   */
  getHeaders() {
    return this.headers;
  }

  /**
   * Get a specific header value.
   * @param {string} name - The name of the header.
   * @returns {string|null} The value of the header, or null if not found.
   */
  getHeader(name) {
    return this.headers[name] || null;
  }

  /**
   * Convert the response to a string representation.
   * @returns {string} A string representation of the response.
   */
  toString() {
    return `QrynResponse {status: ${this.status}, data: ${JSON.stringify(this.data)}}`;
  }
}

module.exports = QrynResponse;