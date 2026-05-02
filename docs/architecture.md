# Architecture

A one-page mental model of `qryn-client`. For the agent-facing rules of engagement, see [`../AGENTS.md`](../AGENTS.md).

## Component graph

```
                         ┌──────────────┐
                         │  QrynClient  │  (src/index.js)
                         └──────┬───────┘
                                │ composes
            ┌───────────────────┼───────────────────┐
            ▼                   ▼                   ▼
      ┌──────────┐       ┌────────────┐      ┌──────────┐
      │   Loki   │       │ Prometheus │      │  Tempo   │
      │  client  │       │   client   │      │  client  │
      │  (logs)  │       │ (metrics)  │      │ (traces) │
      └─────┬────┘       └─────┬──────┘      └─────┬────┘
            │                  │                   │
            └──────────────────┼───────────────────┘
                               ▼
                         ┌──────────┐
                         │   Http   │   (src/services/http.js)
                         │ service  │
                         └──────────┘
                               │
                               ▼
                          fetch + AbortSignal.timeout
                          basic auth
                          QrynError on non-2xx / network failure
```

`QrynClient` constructs one `Http` instance and hands it to all three sub-clients. Sub-clients hold no state of their own beyond the `service` reference.

## Data models

```
                ┌─────────────┐
                │   Stream    │  (src/models/stream.js)
                ├─────────────┤
                │ labels      │
                │ entries[]   │ ◄── addEntry(ts, line)
                │ #cachedKey  │
                │ #snapshot   │
                └──────┬──────┘
                       │ collect() → snapshot + clear
                       │ confirm() → drop snapshot
                       │ undo()    → restore snapshot
                       ▼
                  ┌─────────┐
                  │  Loki   │ ── POST /loki/api/v1/push
                  └─────────┘

                ┌─────────────┐
                │   Metric    │  (src/models/metric.js)
                ├─────────────┤
                │ name        │
                │ labels      │
                │ samples[]   │ ◄── addSample(value, ts?)
                │ #cachedKey  │
                │ #snapshot   │
                └──────┬──────┘
                       │ collect() → snapshot + clear
                       │ confirm() / undo()
                       ▼
                  ┌────────────┐    protobuf-encode + snappy-compress
                  │ Prometheus │ ── POST /api/v1/prom/remote/write
                  └────────────┘
```

The `key` getter on each model produces a stable cache key (label-set hash for streams, name + sorted labels for metrics). The `Collector` uses this key to deduplicate.

## Confirm / undo lifecycle (the most important invariant)

Both `Stream` and `Metric` use the same three-state pattern:

```
    ┌──────────┐                         ┌────────────┐
    │ buffered │ ── collect() ─────────▶ │ in-flight  │
    │ entries  │                         │ (snapshot) │
    └──────────┘                         └─────┬──────┘
         ▲                                     │
         │                                     ├── confirm() → discarded (server 2xx)
         │                                     │
         └──── undo() ◄────────────────────────┘   (error: prepend back to buffer)
```

`collect()` is destructive — it empties the live buffer and stashes a snapshot. From that moment, **exactly one of `confirm()` / `undo()` must be called** before the next `collect()`. The Loki and Prometheus clients are the reference for this discipline.

## Collector batching

The `Collector` (in `src/utils/collector.js`) is an `EventEmitter` that wraps a `QrynClient` and adds:

- **Deduplication.** `createStream` / `createMetric` look up the model by its `key` in an `LRUCache`. Re-creating with the same labels returns the existing instance, so all entries flow into one stream object.
- **Two flush triggers.** A flush fires when `total entries + samples >= maxBulkSize`, or when `maxTimeout` ms elapse since the last add (the timer is reset on every add).
- **Retries.** `retryOperation` retries the push up to `retryAttempts` times with exponential backoff (`retryDelay * 2^(attempt-1)`).
- **Events.** Emits `info` (with the `QrynResponse`) on success, `error` on terminal failure.

```
       addEntry / addSample
              │
              ▼
       incrementTotal()
              │
              ▼
        total >= max?
        ┌──── yes ────┐         ┌──── no ────┐
        ▼             ▼         ▼            ▼
    pushBulk()   clearTimeout   resetTimeout (maxTimeout)
        │                          │
        ▼                          ▼
    loki.push(streams)         (eventually) pushBulk()
    prom.push(metrics)
        │
   retryOperation(...)
        │
   on success → emit('info')
   on failure → restore counters, emit('error')
```

**Important:** the `Collector` pushes *all* cached streams/metrics on every flush. The `Stream` / `Metric` `collect()` methods skip empty buffers via the client-side validator, so only models with new data hit the wire. If you change this, you can easily double-push.

## HTTP transport

`Http.request(path, options)`:

1. Resolves `path` against `baseUrl` via WHATWG `URL`.
2. Merges instance headers + per-call headers.
3. Adds `Authorization: Basic <base64>` if `auth` was provided.
4. Calls `fetch` with `signal: AbortSignal.timeout(timeout)`.
5. Parses the response body based on the **response** `Content-Type`.
6. Throws `QrynError(message, status, body, path)` on non-OK or network/timeout error.
7. Returns `QrynResponse` on 2xx.

`QrynError` extends `Error` and carries `statusCode`, `cause` (original error), and `path`. `QrynResponse` wraps body + status + headers and exposes `isSuccess`, `getHeaders`, `getHeader(name)`.

## Wire formats

| Endpoint | Body | Headers |
|---|---|---|
| `POST /loki/api/v1/push` | JSON `{ streams: [{ labels, entries }] }` | `Content-Type: application/json` |
| `POST /api/v1/prom/remote/write` | protobuf-encoded `WriteRequest`, snappy-compressed | `Content-Type: application/x-protobuf`, `Content-Encoding: snappy`, `X-Prometheus-Remote-Write-Version: 0.1.0` |
| `POST /api/v1/query`, `POST /api/v1/query_range`, `POST /api/v1/series` | `URLSearchParams` | `Content-Type: application/x-www-form-urlencoded` |
| `GET /api/v1/labels`, `GET /api/v1/label/{name}/values`, `GET /api/v1/rules` | — | — |
| `GET /api/search`, `GET /api/v2/search/tag/{name}/values`, `GET /api/traces/{id}/json` | — | `Accept: application/json` |

The protobuf schema is vendored at `src/services/remote.proto`. Don't edit it manually — pull from upstream Prometheus when an update is needed.

## Optional headers (push paths)

All push paths accept these per-call options on `push(arr, options)`:

| Option | Header | Effect |
|---|---|---|
| `orgId` | `X-Scope-OrgID` | Multi-tenant routing. |
| `async` | `X-Async-Insert` | Non-blocking insert (qryn-specific; faster but lossy). |
| `fpLimit` | `X-FP-Limit` | Cap on time-series fingerprints stored. |
| `ttlDays` | `X-Ttl-Days` | Retention override for the push. |
