class Metric {
  #cachedLabels = {}
  constructor(name, labels = {}, options = {}) {
    this.name = name;
    this.labels = labels;
    this.samples = [];
    this.collectedSamples = [];
    this.#cachedLabels = this.generateLabels();
    this.orgId = options.orgId
  }
  getHeaders() {
    const headers = {};
    if (this.orgId) {
      headers['X-Scope-OrgID'] = this.orgId;
    }
    return headers;
  }
  generateLabels() {
    return [
      { name: '__name__', value: this.name },
      ...Object.entries(this.labels).map(([name, value]) => ({ name, value }))
    ];
  }

  addSample(value, timestamp = Date.now()) {
    if (typeof value !== 'number' || typeof timestamp !== 'number') {
      throw new Error('Value and timestamp must be numbers');
    }
    this.samples.push({ value, timestamp });
  }

  collect() {
    const collectedData = {
      labels: this.#cachedLabels,
      samples: this.samples
    };
    this.collectedSamples = this.samples;
    this.samples = [];
    return collectedData;
  }

  undo() {
    this.samples = this.collectedSamples.concat(this.samples);
    this.collectedSamples = [];
  }

  reset() {
    this.samples = [];
    this.collectedSamples = [];
  }
}

module.exports = Metric;