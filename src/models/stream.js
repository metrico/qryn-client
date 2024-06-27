class Stream {
  constructor(labels) {
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
    timestamp =  new Date(timestamp).toISOString()
    this.entries.push({ ts: timestamp, line: line });
  }

  toJSON() {
    return {
      labels: this.labels,
      entries: this.entries
    };
  }
}

module.exports = Stream