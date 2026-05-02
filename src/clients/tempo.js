const { QrynError } = require('../types');

/**
 * Tempo client — read-side access to traces stored in qryn.
 * @see https://grafana.com/docs/tempo/latest/api_docs/
 */
class TempoClient {
    /**
     * @param {import('../services/http')} service - The shared Http service.
     */
    constructor(service) {
        this.service = service;
    }

    /**
     * Search for traces.
     * @param {string|URLSearchParams} [searchParams] - Query string (without leading `?`) or `URLSearchParams`.
     * @param {Object} [options]
     * @param {string} [options.orgId] - Multi-tenant org id → `X-Scope-OrgID`.
     * @returns {Promise<import('../types/qrynResponse')>} A QrynResponse on 2xx.
     * @throws {QrynError} On any non-2xx or network/timeout error.
     */
    async search(searchParams, options = {}) {
        const qs = searchParams ? String(searchParams) : '';
        return this.service.request(`/api/search?${qs}`, {
            method: 'GET',
            headers: this.headers(options)
        }).catch(error => {
            if (error instanceof QrynError) throw error;
            throw new QrynError(`Tempo search failed: ${error.message}`, error.statusCode);
        });
    }

    /**
     * Retrieve the values for a given trace tag (Tempo v2 search API).
     * @param {string} tagName - Tag name (e.g. `service.name`).
     * @param {string|URLSearchParams} [searchParams] - Optional query string.
     * @param {Object} [options]
     * @param {string} [options.orgId]
     * @returns {Promise<import('../types/qrynResponse')>}
     * @throws {QrynError}
     */
    async searchTagValuesV2(tagName, searchParams, options = {}) {
        const qs = searchParams ? String(searchParams) : '';
        return this.service.request(`/api/v2/search/tag/${tagName}/values?${qs}`, {
            method: 'GET',
            headers: this.headers(options)
        }).catch(error => {
            if (error instanceof QrynError) throw error;
            throw new QrynError(`Tempo searchTagValuesV2 failed: ${error.message}`, error.statusCode);
        });
    }

    /**
     * Fetch the full set of spans for a single trace ID.
     * @param {string} traceID - Hex-encoded trace id.
     * @param {Object} [options]
     * @param {string} [options.orgId]
     * @returns {Promise<import('../types/qrynResponse')>}
     * @throws {QrynError}
     */
    async getTraceSpansJson(traceID, options = {}) {
        return this.service.request(`/api/traces/${traceID}/json`, {
            method: 'GET',
            headers: this.headers(options)
        }).catch(error => {
            if (error instanceof QrynError) throw error;
            throw new QrynError(`Tempo getTraceSpansJson failed: ${error.message}`, error.statusCode);
        });
    }

    /**
     * Build per-request headers.
     * @param {Object} [options={}]
     * @param {string} [options.orgId]
     * @returns {Object} Header map.
     */
    headers(options = {}) {
        const headers = {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        };
        if (options.orgId) headers['X-Scope-OrgID'] = options.orgId;
        return headers;
    }
}

module.exports = TempoClient;
