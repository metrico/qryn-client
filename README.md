<a href="https://qryn.cloud" target="_blank"><img src='https://user-images.githubusercontent.com/1423657/218816262-e0e8d7ad-44d0-4a7d-9497-0d383ed78b83.png' width=170></a>

# qryn-client

The official Node.js client for [qryn](https://qryn.dev).

## Installation

You can install qryn-client using npm:

```bash
npm install qryn-client
```

## Usage

### Creating a qryn-client Instance

To create a new instance of QrynClient, you need to provide the necessary configuration options:

```javascript
const { QrynClient } = require('qryn-client');

const client = new QrynClient({
  baseUrl: 'https://qryn.example.com',
  auth: {
    username: 'your-username',
    password: 'your-password'
  },
  timeout: 5000
});
```

- `baseUrl`: The base URL of the Qryn API.
- `auth`: An object containing the authentication credentials (`username` and `password`).
- `timeout`: The timeout value in milliseconds for API requests.

You can create multiple instances of QrynClient with different configurations for backup purposes.

### Pushing Logs to Loki

To push logs to Loki, you need to create a stream, add entries to it, and then push the stream to Loki:

```javascript
const stream1 = client.createStream({ job: 'job1', env: 'prod' });
stream1.addEntry(Date.now(), 'Log message 1');
stream1.addEntry(Date.now(), 'Log message 2');

const stream2 = new Stream({
  job: 'job2',
  env: 'dev',
  level: 'info'
});
stream2.addEntry(Date.now(), 'Log message 3');

const lokiResponse = await client.loki.push([stream1, stream2]).catch(error => {
  console.log(error);
  return client2.loki.push([stream1, stream2]);
});
console.log('Loki push successful:', lokiResponse);
```

- Use `client.createStream()` to create a new stream with the desired labels.
- Use `stream.addEntry()` to add log entries to the stream.
- Use `client.loki.push()` to push an array of streams to Loki.
- You can catch any errors and fallback to a backup client if needed.

### Pushing Metrics to Prometheus

To push metrics to Prometheus, you need to create a metric, add samples to it, and then push the metric to Prometheus:

```javascript
const memoryUsed = client.createMetric({
  name: 'memory_use_test_134',
  labels: { foo: 'bar' }
});
memoryUsed.addSample(1024 * 1024 * 100);
memoryUsed.addSample(105, Date.now() + 60000);

const cpuUsed = new Metric('cpu_test_1234', { server: 'web-1' });
cpuUsed.addSample(1024 * 1024 * 100);

const promResponse = await client.prom.push([memoryUsed, cpuUsed]).catch(error => {
  console.error(error);
  return client2.prom.push([memoryUsed, cpuUsed]);
});
console.log('Prometheus push successful:', promResponse);
```

- Use `client.createMetric()` to create a new metric with the desired name and labels.
- Use `metric.addSample()` to add samples to the metric.
- Use `client.prom.push()` to push an array of metrics to Prometheus.
- You can catch any errors and fallback to a backup client if needed.

### Using the Collector

The `Collector` class provides a convenient way to collect and push streams and metrics to Qryn. It automatically handles the bulk pushing of data based on the specified maximum bulk size and timeout.

```javascript
const { Collector } = require('qryn-client');

const collector = new Collector(client, {
  maxBulkSize: 1000,
  maxTimeout: 5000,
  orgId: 'your-org-id'
});

const stream = collector.createStream({ job: 'job1', env: 'prod' });
stream.addEntry(Date.now(), 'Log message 1');

const metric = collector.createMetric({
  name: 'memory_use_test_134',
  labels: { foo: 'bar' }
});
metric.addSample(1024 * 1024 * 100);
```

- Create a new instance of `Collector` by passing the `QrynClient` instance and the desired options.
  - `maxBulkSize`: The maximum bulk size for pushing data. Default is `1000`.
  - `maxTimeout`: The maximum timeout for pushing data in milliseconds. Default is `5000`.
  - `orgId`: The organization ID.
- Use `collector.createStream()` to create a new stream with the desired labels.
- Use `stream.addEntry()` to add log entries to the stream.
- Use `collector.createMetric()` to create a new metric with the desired name and labels.
- Use `metric.addSample()` to add samples to the metric.
- The collector will automatically push the collected streams and metrics to Qryn when the maximum bulk size is reached or the timeout expires.

The Collector class also emits events to provide information about the push operations:

- `info` event: Emitted when a successful push response is received from Qryn.
- `error` event: Emitted when an error occurs during the push operation.

You can listen to these events to handle the push responses and errors accordingly:

```javascript
collector.on('info', response => {
  console.log('Push successful:', response);
});

collector.on('error', error => {
  console.error('Push error:', error);
});
```

### Reading Metrics from Prometheus

To read metrics from Prometheus, you can use the `createReader()` method of the `prom` object. It returns a `Read` instance that provides methods for querying and retrieving metrics.

```javascript
const reader = client.prom.createReader({
  orgId: 'your-org-id'
});

// Retrieve the list of label names
reader.labels().then(labels => {
  console.log('Label names:', labels.response.data);
});

// Retrieve the list of label values for a specific label name
reader.labelValues('job').then(values => {
  console.log('Label values for "job":', values.response.data);
});

// Execute a PromQL query
const query = 'sum(rate(http_requests_total[5m]))';
reader.query(query).then(result => {
  console.log('Query result:', result.response.data);
});

// Execute a PromQL query over a range of time
const start = Math.floor(Date.now() / 1000) - (0.5 * 60 * 60);
const end = Math.floor(Date.now() / 1000);
const step = 60;
reader.queryRange(query, start, end, step).then(result => {
  console.log('Query range result:', result.response.data);
});

// Retrieve the list of time series that match a specified label set
const match = { job: 'api-server' };
reader.series(match, start, end).then(result => {
  console.log('Series result:', result.response.data);
});

// Retrieve the currently loaded alerting and recording rules
reader.rules().then(result => {
  console.log('Rules:', result.response.data);
});
```

- Use `client.prom.createReader()` to create a new `Read` instance with the desired options.
- Use the methods provided by the `Read` instance to query and retrieve metrics from Prometheus.
- The `labels()` method retrieves the list of label names.
- The `labelValues()` method retrieves the list of label values for a specific label name.
- The `query()` method executes a PromQL query and retrieves the result.
- The `queryRange()` method executes a PromQL query over a range of time.
- The `series()` method retrieves the list of time series that match a specified label set.
- The `rules()` method retrieves the currently loaded alerting and recording rules.

## Error Handling

qryn-client provides error handling mechanisms to catch and handle errors that may occur during API requests. You can use the `.catch()` method to catch errors and implement fallback logic, such as using a backup client.

```javascript
const lokiResponse = await client.loki.push([stream1, stream2]).catch(error => {
  console.log(error);
  return client2.loki.push([stream1, stream2]);
});
```

In the example above, if an error occurs while pushing to Loki using the primary client, the error is caught, and the backup client (`client2`) is used to push the streams instead.

Similarly, you can handle errors while pushing metrics to Prometheus:

```javascript
const promResponse = await client.prom.push([memoryUsed, cpuUsed]).catch(error => {
  console.error(error);
  return client2.prom.push([memoryUsed, cpuUsed]);
});
```

## Configuration

qryn-client allows you to configure various options when creating an instance. Here are the available configuration options:

- `baseUrl` (required): The base URL of the Qryn API.
- `auth` (required): An object containing the authentication credentials.
  - `username`: The username for authentication.
  - `password`: The password for authentication.
- `timeout` (optional): The timeout value in milliseconds for API requests. Default is `5000`.

You can pass these options when creating a new instance of qryn-client:

```javascript
const client = new QrynClient({
  baseUrl: 'https://qryn.example.com',
  auth: {
    username: 'your-username',
    password: 'your-password'
  },
  timeout: 5000
});
```

## API Reference

### qryn-client

#### `constructor(options)`

Creates a new instance of QrynClient.

- `options` (object):
  - `baseUrl` (string): The base URL of the Qryn API.
  - `auth` (object):
    - `username` (string): The username for authentication.
    - `password` (string): The password for authentication.
  - `timeout` (number): The timeout value in milliseconds for API requests.

#### `createStream(labels)`

Creates a new stream with the specified labels.

- `labels` (object): An object containing the labels for the stream.

Returns a new `Stream` instance.

#### `createMetric(options)`

Creates a new metric with the specified options.

- `options` (object):
  - `name` (string): The name of the metric.
  - `labels` (object): An object containing the labels for the metric.

Returns a new `Metric` instance.

### Stream

#### `constructor(labels)`

Creates a new stream with the specified labels.

- `labels` (object): An object containing the labels for the stream.

#### `addEntry(timestamp, message)`

Adds a log entry to the stream.

- `timestamp` (number): The timestamp of the log entry in milliseconds.
- `message` (string): The log message.

### Metric

#### `constructor(name, labels)`

Creates a new metric with the specified name and labels.

- `name` (string): The name of the metric.
- `labels` (object): An object containing the labels for the metric.

#### `addSample(value, timestamp)`

Adds a sample to the metric.

- `value` (number): The value of the sample.
- `timestamp` (number): The timestamp of the sample in milliseconds. Optional, defaults to the current timestamp.

### Collector

#### `constructor(qrynClient, options)`

Creates a new instance of Collector.

- `qrynClient` (object): The QrynClient instance.
- `options` (object):
  - `maxBulkSize` (number): The maximum bulk size for pushing data. Default is `1000`.
  - `maxTimeout` (number): The maximum timeout for pushing data in milliseconds. Default is `5000`.
  - `orgId` (string): The organization ID.

#### `createStream(labels)`

Creates a new stream with the specified labels and adds it to the collector.

- `labels` (object): An object containing the labels for the stream.

Returns a new `Stream` instance.

#### `createMetric(options)`

Creates a new metric with the specified options and adds it to the collector.

- `options` (object):
  - `name` (string): The name of the metric.
  - `labels` (object): An object containing the labels for the metric.

Returns a new `Metric` instance.

### Read

#### `constructor(service, options)`

Creates a new instance of Read.

- `service` (object): The HTTP service for making requests.
- `options` (object):
  - `orgId` (string): The organization ID to include in the request headers.

#### `query(query)`

Execute a PromQL query and retrieve the result.

- `query` (string): The PromQL query string.

Returns a promise that resolves to the response from the query endpoint.

#### `queryRange(query, start, end, step)`

Execute a PromQL query over a range of time.

- `query` (string): The PromQL query string.
- `start` (number): The start timestamp in seconds.
- `end` (number): The end timestamp in seconds.
- `step` (string): The query resolution step width in duration format (e.g., '15s').

Returns a promise that resolves to the response from the query range endpoint.

#### `labels()`

Retrieve the list of label names.

Returns a promise that resolves to the response from the labels endpoint.

#### `labelValues(labelName)`

Retrieve the list of label values for a specific label name.

- `labelName` (string): The name of the label.

Returns a promise that resolves to the response from the label values endpoint.

#### `series(match, start, end)`

Retrieve the list of time series that match a specified label set.

- `match` (object): The label set to match.
- `start` (number): The start timestamp in seconds.
- `end` (number): The end timestamp in seconds.

Returns a promise that resolves to the response from the series endpoint.

#### `rules()`

Retrieve the currently loaded alerting and recording rules.

Returns a promise that resolves to the response from the rules endpoint.

## Contributing

Contributions to qryn-client are welcome! If you find any issues or have suggestions for improvements, please open an issue or submit a pull request on the [GitHub repository](https://github.com/metrico/qryn-client).

## License

qryn-client is open-source software licensed under the [MIT License](https://opensource.org/licenses/MIT).