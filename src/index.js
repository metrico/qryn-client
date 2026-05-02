const {Stream, Metric} = require('./models');
const PrometheusClient = require('./clients/prometheus');
const Collector = require('./utils/collector');
const LokiClient = require('./clients/loki');
const TempoClient = require('./clients/tempo');
const Http = require('./services/http');
const {
  QrynError,
  QrynAbortedError,
  QrynTimeoutError
} = require('./types');
const { normalizeAuth } = require('./services/auth');

let __legacyAuthWarned = false;

/**
 * Main client for qryn operations.
 */
class QrynClient {
  /**
   * @param {Object} config
   * @param {string} [config.baseUrl='http://localhost:3100']
   * @param {import('./services/auth').QrynAuth | {username:string,password:string}} [config.auth]
   * @param {number} [config.timeout=60000]
   * @param {Object} [config.headers={}]
   * @param {import('./utils/retry').RetryOptions} [config.retry]
   * @param {string} [config.defaultOrgId]
   */
  constructor(config) {
    if (typeof config !== 'object' || config === null) {
      throw new QrynError('Config must be a non-null object');
    }

    const { auth, legacy } = normalizeAuth(config.auth);
    if (legacy && !__legacyAuthWarned) {
      __legacyAuthWarned = true;
      process.emitWarning(
        "qryn-client: auth: { username, password } is deprecated; use auth: { type: 'basic', username, password }. The legacy shape will be removed in 2.0.0.",
        'DeprecationWarning',
        'QRYN_AUTH_LEGACY'
      );
    }

    const baseUrl = config.baseUrl || 'http://localhost:3100';
    const timeout = config.timeout || 60000;
    const headers = {
      'Content-Type': 'application/json',
      ...config.headers
    };

    const http = new Http(baseUrl, timeout, headers, auth, {
      retry: config.retry,
      defaultOrgId: config.defaultOrgId
    });

    this.prom = new PrometheusClient(http);
    this.loki = new LokiClient(http);
    this.tempo = new TempoClient(http);
  }

  createCollector(config) { return new Collector(this, config); }
  createStream(labels)    { return new Stream(labels); }
  createMetric({ name, labels = {} }) { return new Metric(name, labels); }
}

module.exports = {
  QrynClient,
  Stream,
  Metric,
  Collector,
  QrynError,
  QrynAbortedError,
  QrynTimeoutError
};
