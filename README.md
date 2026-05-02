<a href="https://qryn.cloud" target="_blank"><img src='https://user-images.githubusercontent.com/1423657/218816262-e0e8d7ad-44d0-4a7d-9497-0d383ed78b83.png' width=170></a>

# qryn-client

The official Node.js client for [qryn](https://qryn.dev).

## Installation

You can install qryn-client using npm:

```bash
npm install qryn-client
```

## Migration to 1.1.0

### Auth shapes

Version 1.1.0 introduces a discriminated-union auth config. The old `{ username, password }` shape still works but emits a `DeprecationWarning` (code `QRYN_AUTH_LEGACY`) once per process and will be removed in 2.0.0.

```js
const { QrynClient } = require('qryn-client');

// basic (new preferred shape)
const client = new QrynClient({
  baseUrl: 'https://qryn.example.com',
  auth: { type: 'basic', username: 'user', password: 'pass' }
});

// bearer — static string or async thunk (re-invoked each request)
const client = new QrynClient({
  baseUrl: 'https://qryn.example.com',
  auth: { type: 'bearer', token: () => fetchToken() }
});

// custom — header map or async thunk
const client = new QrynClient({
  baseUrl: 'https://qryn.example.com',
  auth: { type: 'custom', headers: { 'X-Api-Key': 'my-key' } }
});

// legacy — still accepted, emits DeprecationWarning QRYN_AUTH_LEGACY
const client = new QrynClient({
  baseUrl: 'https://qryn.example.com',
  auth: { username: 'user', password: 'pass' }
});
```

### New constructor options

```js
const client = new QrynClient({
  baseUrl: 'https://qryn.example.com',
  auth: { type: 'basic', username: 'user', password: 'pass' },
  timeout: 60000,      // default is now 60 000 ms (was 5 000 ms in 1.0.x)
  retry: {             // default: { attempts: 3, baseDelayMs: 200, maxDelayMs: 5000 }
    attempts: 5,
    baseDelayMs: 500,
    maxDelayMs: 10000
  },
  defaultOrgId: 'tenant-a'  // sent as X-Scope-OrgID on every request
});
```

**Default timeout change:** the client-level `timeout` default is now `60_000` ms (was `5_000` ms). If your code relied on the 5 s default, pass `timeout: 5000` explicitly.

### Retry policy

Requests are automatically retried on transient failures. The built-in defaults:

| Setting | Default |
|---|---|
| `attempts` | `3` |
| `baseDelayMs` | `200` |
| `maxDelayMs` | `5000` |

Retries fire on network errors (`ECONNREFUSED`, `ECONNRESET`, `ETIMEDOUT`, `EAI_AGAIN`) and HTTP `408 / 429 / 502 / 503 / 504`. On HTTP 429 the `Retry-After` response header is honored. Retries never fire after a caller abort.

Pass `retry` in the constructor to set a process-wide policy, or per-call via the `opts` argument to override for a single request.

### Per-call opts

Every read method (Loki reader, Prom reader, Tempo), `loki.push`, and `prom.push` accept an `opts` argument:

```js
const opts = {
  signal: controller.signal,  // AbortSignal — cancels the request immediately
  timeoutMs: 5000,             // per-call timeout; overrides constructor timeout
  retry: { attempts: 1 },     // per-call retry policy; overrides constructor retry
  orgId: 'tenant-b'           // per-call X-Scope-OrgID; overrides defaultOrgId
};

await client.loki.push([stream], opts);
await reader.query('{job="x"}', new Date(), opts);
await client.tempo.search({ q: '{}' }, opts);
```

### Abort and timeout errors

```js
const { QrynAbortedError, QrynTimeoutError } = require('qryn-client');

try {
  await client.loki.push([stream], { timeoutMs: 2000 });
} catch (e) {
  if (e instanceof QrynTimeoutError) {
    // per-request timeout fired; e.durationMs tells you how long it ran
    console.error('timed out after', e.durationMs, 'ms');
  }
}

const controller = new AbortController();
controller.abort();
try {
  await client.loki.push([stream], { signal: controller.signal });
} catch (e) {
  if (e instanceof QrynAbortedError) {
    // caller cancelled; safe to ignore or log
  }
}
```

For the underlying HTTP and auth architecture, see [`docs/architecture.md`](docs/architecture.md).

### Loki reader

`client.loki.createReader(options?)` returns a `LokiReader` with the full LogQL read surface.

```js
const reader = client.loki.createReader({ orgId: 'tenant-a' });

// instant query
const res = await reader.query('{job="api"}', new Date());

// range query
const res = await reader.queryRange('{job="api"}', startMs, endMs, '15s', 100, 'backward');

// label names and values
const labels = await reader.labels();
const values = await reader.labelValues('job');

// series
const series = await reader.series(['{job="api"}']);
```

All reader methods accept the same per-call `opts` described above as their last argument.

### New Tempo methods

```js
// list all tag keys (scope: 'span' | 'resource' | 'intrinsic')
const tags = await client.tempo.searchTags('resource');

// list values for a tag key (v1)
const vals = await client.tempo.searchTagValues('service.name');

// fetch all spans for a trace (alias of getTraceSpansJson)
const trace = await client.tempo.getTrace('abc123def456');
```

---

## Usage

### Creating a qryn-client Instance

To create a new instance of QrynClient, you need to provide the necessary configuration options:

```javascript
const { QrynClient } = require('qryn-client');

const client = new QrynClient({
  baseUrl: 'https://qryn.example.com',
  auth: { type: 'basic', username: 'your-username', password: 'your-password' },
  timeout: 60000
});
```

- `baseUrl`: The base URL of the Qryn API. Defaults to `http://localhost:3100`.
- `auth`: Auth config — see [Migration to 1.1.0 → Auth shapes](#auth-shapes) for the full discriminated-union surface.
- `timeout`: Per-request timeout in milliseconds. Defaults to `60000`.
- `retry`: Default retry policy `{ attempts, baseDelayMs, maxDelayMs }`. Defaults to `{ attempts: 3, baseDelayMs: 200, maxDelayMs: 5000 }`.
- `defaultOrgId`: Sent as `X-Scope-OrgID` on every request when set.
- `headers`: Optional. Extra default headers merged into every request (e.g. `{ 'X-Custom': 'value' }`).

You can create multiple instances of QrynClient with different configurations for backup purposes.

### Per-push options

`loki.push` and `prom.push` accept a second `options` argument. The same options are honored by `Collector` if you set them at the collector level.

| Option | Header | Effect |
|---|---|---|
| `orgId` | `X-Scope-OrgID` | Multi-tenant routing. |
| `async` | `X-Async-Insert` | Non-blocking insert (faster but lossy). |
| `fpLimit` | `X-FP-Limit` | Cap on the number of time-series fingerprints stored. |
| `ttlDays` | `X-Ttl-Days` | Retention override for the push. |

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

### Searching Traces with Tempo

The `tempo` sub-client exposes Tempo's search and trace-fetch endpoints.

```javascript
// Free-form search (Tempo `/api/search`)
const search = await client.tempo.search('tags=service.name=auth-svc&limit=20');
console.log(search.response);

// Tag-value lookup (Tempo v2 `/api/v2/search/tag/{name}/values`)
const tagValues = await client.tempo.searchTagValuesV2('service.name');
console.log(tagValues.response);

// Fetch all spans for a single trace
const trace = await client.tempo.getTraceSpansJson('abc123def456...');
console.log(trace.response);
```

All Tempo methods accept an optional `{ orgId }` second argument that maps to the `X-Scope-OrgID` header for multi-tenant deployments. Errors throw `QrynError` (matching Loki and Prometheus), so the same `.catch()`-based failover pattern applies.

### Using the Collector

The `Collector` class provides a convenient way to collect and push streams and metrics to Qryn. It automatically handles the bulk pushing of data based on the specified maximum bulk size and timeout.

```javascript
// Either of these forms works — prefer the factory:
const collector = client.createCollector({
  maxBulkSize: 1000,
  maxTimeout: 5000,
  orgId: 'your-org-id'
});

// Or, equivalently:
const { Collector } = require('qryn-client');
const collector2 = new Collector(client, { /* same options */ });

const stream = collector.createStream({ job: 'job1', env: 'prod' });
stream.addEntry(Date.now(), 'Log message 1');

const metric = collector.createMetric({
  name: 'memory_use_test_134',
  labels: { foo: 'bar' }
});
metric.addSample(1024 * 1024 * 100);
```

#### Collector options

| Option | Default | Description |
|---|---|---|
| `maxBulkSize` | `1000` | Push when total entries+samples reach this count. |
| `maxTimeout` | `5000` | Push if no activity for this many ms (resets on every add). |
| `orgId` | — | Multi-tenant routing → `X-Scope-OrgID` on every push. |
| `async` | — | Non-blocking insert → `X-Async-Insert`. Faster but lossy. |
| `fpLimit` | — | Fingerprint cap → `X-FP-Limit`. |
| `ttlDays` | — | Retention override → `X-Ttl-Days`. |
| `retryAttempts` | `3` | Total push attempts before emitting `'error'`. |
| `retryDelay` | `1000` | Base delay (ms) for exponential backoff between retries. |
| `cache` | LRU defaults below | Passed to [`lru-cache`](https://www.npmjs.com/package/lru-cache). Defaults: `max=10000`, `ttl=3600000`, `updateAgeOnGet=true`, `allowStale=false`. |

- Use `collector.createStream()` to create a new stream with the desired labels. Repeated calls with the same labels return the existing instance (deduped by label-set key).
- Use `stream.addEntry()` to add log entries to the stream.
- Use `collector.createMetric()` to create a new metric with the desired name and labels. Same deduplication applies.
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

- `baseUrl` (optional): The base URL of the Qryn API. Default is `http://localhost:3100`.
- `auth` (optional): Auth config. Accepted shapes: `{ type: 'basic', username, password }`, `{ type: 'bearer', token }`, `{ type: 'custom', headers }`. See [Migration to 1.1.0 → Auth shapes](#auth-shapes).
- `timeout` (optional): Per-request timeout in milliseconds. Default is `60000`.
- `retry` (optional): Default retry policy `{ attempts, baseDelayMs, maxDelayMs }`. Default is `{ attempts: 3, baseDelayMs: 200, maxDelayMs: 5000 }`.
- `defaultOrgId` (optional): Sent as `X-Scope-OrgID` on every request when set.
- `headers` (optional): Extra default headers merged into every request. `Content-Type: application/json` is set by default and can be overridden here.

```javascript
const client = new QrynClient({
  baseUrl: 'https://qryn.example.com',
  auth: { type: 'basic', username: 'your-username', password: 'your-password' },
  timeout: 60000,
  retry: { attempts: 3, baseDelayMs: 200, maxDelayMs: 5000 },
  defaultOrgId: 'my-tenant'
});
```

## API Reference

### qryn-client

#### `constructor(options)`

Creates a new instance of QrynClient.

- `options` (object):
  - `baseUrl` (string): The base URL of the Qryn API. Defaults to `http://localhost:3100`.
  - `auth` (`QrynAuth | { username, password }`): Auth config. See [Auth shapes](#auth-shapes).
  - `timeout` (number): Per-request timeout in milliseconds. Defaults to `60000`.
  - `retry` (object): Default retry policy `{ attempts, baseDelayMs, maxDelayMs }`. Defaults to `{ attempts: 3, baseDelayMs: 200, maxDelayMs: 5000 }`.
  - `defaultOrgId` (string): Sent as `X-Scope-OrgID` on every request when set.
  - `headers` (object): Optional extra default headers merged into every request.

#### `createCollector(options)`

Creates a new `Collector` bound to this client. See the [Collector options table](#collector-options) for the full surface.

Returns a new `Collector` instance.

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

Creates a new instance of Collector. Prefer `client.createCollector(options)` for new code.

- `qrynClient` (object): The QrynClient instance.
- `options` (object): see the [Collector options table](#collector-options) for all fields. Headline options:
  - `maxBulkSize` (number, default `1000`).
  - `maxTimeout` (number, default `5000`).
  - `orgId` (string).
  - `async`, `fpLimit`, `ttlDays` — passed through as headers on every push.
  - `retryAttempts` (default `3`), `retryDelay` (default `1000`).
  - `cache` — `lru-cache` options, see [Collector options table](#collector-options).

#### Events

Emitted via the standard `EventEmitter` interface:

- `'info'` — fired with the `QrynResponse` after a successful push.
- `'error'` — fired with a `QrynError` when all retry attempts have been exhausted.

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

### Tempo

Accessed via `client.tempo`. All methods return a `Promise<QrynResponse>` and throw `QrynError` on failure. All `options` accept the per-call opts shape `{ signal, timeoutMs, retry, orgId }`.

#### `search(searchParams, options?)`

Free-form trace search against `/api/search`.

- `searchParams` (string | URLSearchParams | `{ q, start?, end?, limit?, spss? }`): query params.
- `options` (object, optional): per-call opts.

#### `searchTags(scope?, options?)`

Returns all tag keys. New in 1.1.0.

- `scope` (`'span' | 'resource' | 'intrinsic'`, optional): filter by scope.
- `options` (object, optional): per-call opts.

#### `searchTagValues(tagName, options?)`

Returns values for a tag key using Tempo's v1 search API. New in 1.1.0.

- `tagName` (string): e.g. `service.name`.
- `options` (object, optional): per-call opts.

#### `searchTagValuesV2(tagName, searchParams?, options?)`

Returns the values for a given tag using Tempo's v2 search API.

- `tagName` (string): e.g. `service.name`.
- `searchParams` (string | URLSearchParams, optional).
- `options` (object, optional): per-call opts.

#### `getTrace(traceID, options?)`

Fetches the full JSON span payload for a single trace. New in 1.1.0; alias of `getTraceSpansJson`.

- `traceID` (string): hex-encoded trace id.
- `options` (object, optional): per-call opts.

#### `getTraceSpansJson(traceID, options?)`

Fetches the full JSON span payload for a single trace.

- `traceID` (string): hex-encoded trace id.
- `options` (object, optional): per-call opts.

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

### LokiReader

Accessed via `client.loki.createReader(options?)`. All methods return a `Promise<QrynResponse>` and throw `QrynError` on failure. Every method accepts a trailing `opts` argument `{ signal, timeoutMs, retry, orgId }`.

#### `constructor(service, options?)`

- `options.orgId` (string, optional): applied to every request made through this reader instance.

#### `query(query, time?, opts?)`

Instant LogQL query.

- `query` (string): LogQL query string.
- `time` (Date | number | string, optional): evaluation timestamp.

#### `queryRange(query, start, end, step?, limit?, direction?, opts?)`

Range LogQL query.

- `query` (string): LogQL query string.
- `start`, `end` (Date | number | string): time range.
- `step` (string, optional): e.g. `'15s'`.
- `limit` (number, optional): max entries to return.
- `direction` (`'forward' | 'backward'`, optional).

#### `labels(start?, end?, opts?)`

Returns all label names.

#### `labelValues(label, start?, end?, match?, opts?)`

Returns values for a single label name.

- `label` (string): label name (required).

#### `series(matchers, start?, end?, opts?)`

Returns series matching one or more matchers.

- `matchers` (string | string[]): one or more LogQL stream matchers, e.g. `['{job="api"}']`.

### Errors

All errors extend `QrynError`. New in 1.1.0:

#### `QrynAbortedError`

Thrown when a request is cancelled via an `AbortSignal`. Carries `cause` (the abort reason).

#### `QrynTimeoutError`

Thrown when the per-request timeout fires. Carries `durationMs` (elapsed ms at the point of abort).

```js
const { QrynAbortedError, QrynTimeoutError, QrynError } = require('qryn-client');
```

## Contributing

Contributions to qryn-client are welcome! If you find any issues or have suggestions for improvements, please open an issue or submit a pull request on the [GitHub repository](https://github.com/metrico/qryn-client).

## License

qryn-client is open-source software licensed under the [MIT License](https://opensource.org/licenses/MIT).