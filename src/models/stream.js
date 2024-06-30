
class Stream {
  #collectEntries = [];
  constructor(labels, options = {}) {
    if (typeof labels !== 'object' || labels === null) {
      throw new Error('Labels must be a non-null object');
    }
    this.labels = this.formatLabels(labels);
    this.entries = [];

  }

  formatLabels(labels) {
    return '{' + Object.entries(labels)
      .map(([key, value]) => `${key}="${value}"`)
      .join(',') + '}';
  }

  addEntry(timestamp, line) {
    timestamp = new Date(timestamp).toISOString();
    this.entries.push({ ts: timestamp, line: line });
  }

  collect() {
    const collectedData = this.toJSON();
    this.#collectEntries = this.entries;
    this.entries = [];
    return collectedData;
  }

  undo() {
    this.entries = this.#collectEntries.concat(this.entries);
    this.#collectEntries = [];
  }

  reset() {
    this.entries = [];
    this.#collectEntries = [];
  }

  toJSON() {
    return {
      labels: this.labels,
      entries: this.entries
    };
  }
}

module.exports = Stream;