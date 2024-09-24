const { QrynError } = require('../types');
const { URL } = require('url');
const QrynResponse = require('../types/qrynResponse');

/**
 * Handles HTTP requests for QrynClient.
 */
class Http {
  baseUrl = null;
  timeout = null;
  headers = null;
  basicAuth = null;

  /**
   * Create an HttpClient.
   * @param {string} baseUrl - The base URL for the qryn server.
   * @param {number} timeout - The timeout for requests in milliseconds.
   * @param {Object} headers - Headers to send with requests.
   */
  constructor(baseUrl, timeout, headers, auth) {
    this.baseUrl = new URL(baseUrl);
    this.timeout = timeout;
    this.headers = headers;
    this.#setBasicAuth(auth)
  }

  /**
   * Set basic authentication credentials.
   * @param {string} username - The username for basic auth.
   * @param {string} password - The password for basic auth.
   */
  #setBasicAuth({username, password}) {
    this.basicAuth = Buffer.from(`${username}:${password}`).toString('base64');
  }

  /**
   * Make an HTTP request.
   * @param {string} path - The path to append to the base URL.
   * @param {Object} options - The options for the fetch request.
   * @returns {Promise<Object>} The parsed JSON response.
   * @throws {QrynError} If the request fails or returns a non-OK status.
   */
  async request(path, options = {}) {
    const url = new URL(path, this.baseUrl);
    const headers = { ...this.headers, ...options.headers };
    let res = {};

    // Add Authorization header if basic auth is set
    if (this.basicAuth) {
      headers['Authorization'] = `Basic ${this.basicAuth}`;
    }

    const fetchOptions = {
      ...options,
      headers,
      signal: AbortSignal.timeout(this.timeout)
    };

    try {
      const response = await fetch(url.toString(), fetchOptions);


      if(headers['Content-Type'] === 'application/x-www-form-urlencoded'){
        res = await response.json();
      }

      if (!response.ok) {
        let message = `HTTP error! status: ${response.status}`
        throw new QrynError(message, response.status, res, path);
      }
      
      return new QrynResponse(res, response.status, response.headers, path)
      
    } catch (error) {
      if(error instanceof QrynError)
        throw error;
      throw new QrynError(`Request failed: ${error.message} ${error?.cause?.message}`, 400, error.cause, path);    
    }
  }
}

module.exports = Http;