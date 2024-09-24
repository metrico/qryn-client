class Stream {
  #key = '';
  #cachedLabels = '';
  #collectedEntries = [];

  constructor(labels = {}) {
    if (typeof labels !== 'object' || labels === null) {
      throw new Error('Labels must be a non-null object');
    }
    this.labels = labels;
    this.entries = [];
    this.#cachedLabels = this.formatLabels(labels);
    this.listeners = [];
  }

  get key() {
    if (this.#key) return this.#key;
    this.#key = this.#cachedLabels;
    return this.#key;
  }

  get hasBulkProcessing() {
    return Boolean(this.listeners.length);
  }

  formatLabels(labels) {
    return '{' + Object.entries(labels)
      .map(([key, value]) => `${key}="${value.toString()}"`)
      .join(',') + '}';
  }

  addListener(callback) {
    if (typeof callback !== 'function') {
      throw new Error('Callback must be a function');
    }
    this.listeners.push(callback);
  }

  #notifyListeners() {
    if (this.entries.length > 0) {
      this.listeners.forEach(listener => listener(this));
    }
  }

  addEntry(timestamp, line) {
    const formattedTimestamp = new Date(timestamp).toISOString();
    this.entries.push({ ts: formattedTimestamp, line: line });
    this.#notifyListeners();
  }

  collect() {
    const collectedData = this.toJSON();
    this.#collectedEntries = this.entries;
    this.entries = [];
    return collectedData;
  }

  confirm() {
    this.#collectedEntries = [];
  }

  undo() {
    this.entries = this.#collectedEntries.concat(this.entries);
    this.#collectedEntries = [];
  }

  reset() {
    this.entries = [];
    this.#collectedEntries = [];
  }

  toJSON() {
    return {
      labels: this.#cachedLabels,
      entries: this.entries
    };
  }
}

module.exports = Stream;