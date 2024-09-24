class Metric {
  #cachedLabels = {}
  #key = '';
  constructor(name, labels = {}) {
    this.name = name;
    this.labels = labels;
    this.samples = [];
    this.collectedSamples = [];
    this.#cachedLabels = this.generateLabels();
    this.listeners = [];
    this.timeoutId = null;
  }
  get hasBulkProcessing() { 
    return Boolean(this.listeners.length);
  }
  
  get key() {
    if (this.#key) return this.#key;
    this.#key = JSON.stringify(this.#cachedLabels);
    return this.#key;
  }
  addListener(callback) { // Changed from subscribe
    if (typeof callback !== 'function') {
      throw new Error('Callback must be a function');
    }
    this.listeners.push(callback);
  }
  
  generateLabels() {
    const labels = [{ name: '__name__', value: this.name }];
    this.#key = this.name;
    // Changed to use Object.entries() and for...of loop
    for (const [name, value] of Object.entries(this.labels)) {
      const label = String(value); // Ensure value is converted to string
      labels.push({ name, value: label });
      this.#key += `:${name}:${label}`;
    }
    return labels;
  }
  
  #notifyListeners() {
    if (this.samples.length > 0) {
      this.listeners.forEach(listener => listener(this));
    }
  }
  
  
  addSample(value, timestamp = Date.now()) {
    if (typeof value !== 'number' || typeof timestamp !== 'number') {
      throw new Error('Value and timestamp must be numbers');
    }
    this.samples.push({ value, timestamp });

    this.#notifyListeners();
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
  
  confirm() {
    this.collectedSamples = [];
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