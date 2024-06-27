class Metric {
  constructor(name, labels = {}) {
    this.name = name;
    this.labels = labels;
    this.samples = [];
  }

  addSample(value, timestamp = Date.now()) {
    if (typeof value !== 'number') {
      throw new Error('Value must be a number');
    }
    if (typeof timestamp !== 'number') {
      throw new Error('Timestamp must be a number');
    }

    this.samples.push({ value, timestamp });
  }

  toTimeSeries() {
    return {
      labels: [
        { name: '__name__', value: this.name },
        ...Object.entries(this.labels).map(([name, value]) => ({ name, value }))
      ],
      samples: this.samples
    };
  }
}
module.exports = Metric;