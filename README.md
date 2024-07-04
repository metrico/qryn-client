# qryn-client

The official Node.js client for [Qryn](https://qryn.cloud/).

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

## Contributing

Contributions to qryn-client are welcome! If you find any issues or have suggestions for improvements, please open an issue or submit a pull request on the [GitHub repository](https://github.com/metrico/qryn-client).

## License

qryn-client is open-source software licensed under the [MIT License](https://opensource.org/licenses/MIT).