const {QrynError} = require("../types");

class TempoClient {
    /**
     * Create a new Tempo instance.
     * @param {Http} service - The HTTP service to use for requests.
     */
    constructor(service) {
        this.service = service;
    }

    async search(searchParams) {
        return this.service.request(`/api/search?${searchParams ? searchParams : ''}`, {
            method: 'GET'
        }).catch(error => {
            console.error('ERROR:', error)
        });
    }

    async searchTagValuesV2(tagName, searchParams) {
        return this.service.request(`/api/v2/search/tag/${tagName}/values?${searchParams ? searchParams : ''}`, {
            method: 'GET'
        })
    }

    headers(options) {
        let headers = {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        };
        if (options.orgId) headers['X-Scope-OrgID'] = options.orgId;
        return headers;
    }
}

module.exports = TempoClient