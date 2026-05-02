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
                          fetch + AbortSignal.timeout + anySignal
                          auth (basic/bearer/custom) resolved per-request
                          retry loop with backoff + jitter
                          QrynError / QrynAbortedError / QrynTimeoutError
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

`Http.request(path, options)` is a per-call options pipeline. Per-call values for `signal`, `timeoutMs`, `retry`, and `orgId` override the constructor-time defaults.

### Single-request flow

1. Resolve `path` against `baseUrl` via WHATWG `URL`.
2. Compute effective timeout: `options.timeoutMs ?? this.timeout` (default `60_000` ms).
3. Await `resolveAuthHeaders(auth)` to get `Authorization` / custom headers (see [Auth](#auth)).
4. Resolve `orgId`: `options.orgId ?? this.defaultOrgId`.
5. Merge headers: instance headers → per-call headers → auth headers → `X-Scope-OrgID` if orgId is set.
6. Build combined `AbortSignal`: `anySignal([options.signal, AbortSignal.timeout(effectiveTimeout)])`.
7. Call `fetch`. On `AbortError`:
   - If `options.signal.aborted` → throw `QrynAbortedError`.
   - Otherwise → throw `QrynTimeoutError(durationMs)`.
   - Other network errors → throw `QrynError`.
8. Parse response body from **response** `Content-Type` (`application/json` → JSON, other → text).
9. Throw `QrynError(message, status, cause, path)` on non-OK.
10. Return `QrynResponse` on 2xx.

### Retry loop

`Http.request` wraps `#singleRequest` in a retry loop driven by `RetryOptions`:

```
{ attempts: 3, baseDelayMs: 200, maxDelayMs: 5000 }   ← defaults
```

Retry policy:
- **Never retry** on `QrynAbortedError` (caller cancelled).
- **Retry** on network errors: `ECONNREFUSED`, `ECONNRESET`, `ETIMEDOUT`, `EAI_AGAIN`.
- **Retry** on HTTP `408 / 429 / 502 / 503 / 504`. Never retry other 4xx.
- On HTTP 429, honor `Retry-After` response header (seconds or RFC 7231 date).
- Delay between attempts uses **exponential backoff with full jitter**: `jitter * min(maxDelayMs, baseDelayMs * 2^(attempt-1))`.
- Per-call `options.retry` overrides constructor-level `retry`, which overrides the built-in default.

### Error types

| Class | When thrown | Extra fields |
|---|---|---|
| `QrynError` | non-2xx response, unrecognised network error | `statusCode`, `cause`, `path` |
| `QrynAbortedError` | `AbortSignal` fired by caller | `cause` (abort reason) |
| `QrynTimeoutError` | per-request timeout fired | `durationMs` |

`QrynAbortedError` and `QrynTimeoutError` both extend `QrynError`.

## Auth

Auth is a discriminated union resolved per-request by `resolveAuthHeaders(auth)`.

| `type` | Config | Header produced |
|---|---|---|
| `'basic'` | `{ username, password }` | `Authorization: Basic <base64>` |
| `'bearer'` | `{ token: string \| () => Promise<string> }` | `Authorization: Bearer <token>` |
| `'custom'` | `{ headers: Record<string,string> \| () => Promise<Record<string,string>> }` | Spread directly into request headers |

For `'bearer'` and `'custom'`, if the value is a function it is **awaited each request**, enabling token-refresh without recreating the client.

### Legacy shape

Constructing with `auth: { username, password }` (no `type`) is still accepted. It is coerced to `{ type: 'basic', ... }` internally and fires `process.emitWarning(..., 'DeprecationWarning', 'QRYN_AUTH_LEGACY')` once per process. The legacy shape will be removed in 2.0.0.

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
