# qryn-client Extensions Requirements

## Purpose

Defines the additions to `metrico/qryn-client` required to support the Voicenter qryn-MCP. Scoped tightly to what unblocks the MCP; broader qryn-client improvements out of scope.

## Current state

`metrico/qryn-client` (MIT) covers: Loki write (`Stream`, `client.loki.push`), Prometheus write (`Metric`, `client.prom.push`), Prometheus read (`client.prom.createReader().{query,queryRange,labels,labelValues,series,rules}`), and the `Collector` batched ingestion helper. Auth is HTTP Basic only. No TypeScript types. No tests visible. No published npm package.

## MCP build dependency

The Voicenter qryn-MCP (separate workstream) consumes this library. Sequencing:

- **MCP can begin building** as soon as `qryn-client 0.2.0` is available (P0 items below).
- **MCP trace tools** (`traceql_search`, `tempo_get_trace`) target `qryn-client 0.3.0`. Until then, the MCP implements an axios fallback path; the gateway interface stays stable so the swap is mechanical.
- **MCP v1 GA target** = `qryn-client ≥ 0.3.0`.

## Deliverables, prioritized

### P0 — blocking the MCP build

#### 1. Loki reader (LogQL reads)

Mirror of `client.prom.createReader()` for Loki/LogQL, since SOC/NOC investigations are log-heavy.

```ts
client.loki.createReader({ orgId? }) → LokiReader

interface LokiReader {
  query(query: string, time?: Date | number, opts?: ReadOpts): Promise<LokiInstantResponse>
  queryRange(query: string, start: Date | number, end: Date | number,
             step?: string, limit?: number, direction?: 'forward'|'backward',
             opts?: ReadOpts): Promise<LokiRangeResponse>
  labels(start?: Date | number, end?: Date | number, opts?: ReadOpts): Promise<string[]>
  labelValues(label: string, start?: Date | number, end?: Date | number,
              match?: string, opts?: ReadOpts): Promise<string[]>
  series(matchers: string[], start?: Date | number, end?: Date | number,
         opts?: ReadOpts): Promise<SeriesResponse>
}
```

**Acceptance**
- All methods round-trip against a qryn instance with parity to Grafana's Loki datasource behavior
- Time params accept Date and unix-seconds number; nanosecond precision preserved for log timestamps
- Returns typed responses, not raw axios envelopes
- Streams not materialized beyond `limit`
- Tests against `docker-compose` qryn-minimal pass

#### 2. TypeScript types

Either ship `.d.ts` alongside the JS or migrate the library to TS. Migration to TS preferred — the library is small enough that a one-shot rewrite is cheaper than maintaining hand-written declarations.

**Acceptance**
- All public APIs (constructor, `loki.*`, `prom.*`, `tempo.*`, `Stream`, `Metric`, `Collector`) have explicit types for inputs and outputs
- No `any` in the public surface
- `tsc --noEmit --strict` passes from a consumer project
- Types are published with the npm package

#### 3. AbortSignal on every read method

```ts
interface ReadOpts {
  signal?: AbortSignal
  timeoutMs?: number          // default 60_000
}
```

**Acceptance**
- When the signal fires, the in-flight axios request is aborted (axios's `signal` parameter)
- Aborted calls throw a typed `QrynAbortedError`, distinct from network or timeout errors
- Tail/streaming methods (when added) close cleanly on abort

#### 4. Retry/backoff with sane defaults

```ts
interface RetryOptions {
  attempts: number              // default 3 (i.e. 1 try + 2 retries)
  baseDelayMs: number           // default 200
  maxDelayMs: number            // default 5_000
  retryOn?: (status: number, attempt: number) => boolean
}
```

Implementation: `axios-retry` or hand-rolled with exponential backoff plus jitter.

**Acceptance**
- Default policy retries on: network errors (ECONNREFUSED, ECONNRESET, ETIMEDOUT), 502/503/504, 408, 429 (honoring `Retry-After` header)
- Never retries on 4xx other than 408 and 429
- Configurable per-call via `opts.retry`, falling back to constructor default
- Retries do not double-count against `opts.timeoutMs` — each attempt gets the full timeout

#### 5. Pluggable auth

Replace the current `auth: { username, password }` with a discriminated union, plus a `headers` escape hatch.

```ts
type QrynAuth =
  | { type: 'basic'; username: string; password: string }
  | { type: 'bearer'; token: string | (() => Promise<string>) }
  | { type: 'custom'; headers: Record<string,string> | (() => Promise<Record<string,string>>) }

interface QrynClientOptions {
  baseUrl: string
  auth?: QrynAuth
  headers?: Record<string,string>     // additional, merged before auth headers
  timeout?: number
  retry?: RetryOptions
  agent?: import('http').Agent
  defaultOrgId?: string                // sets X-Scope-OrgID by default
}
```

**Acceptance**
- Bearer token can be a thunk so callers can refresh from a token store on each request
- `auth` is optional; an unauthenticated client is valid for local dev
- `headers` merges before auth headers and is overridden by per-request opts when added later
- `defaultOrgId` is added as `X-Scope-OrgID` header on every request

### P1 — needed for traces and full v1 surface

#### 6. Tempo client (TraceQL reads)

```ts
client.tempo: TempoClient

interface TempoClient {
  search(query: string, opts?: SearchOpts & ReadOpts): Promise<TempoSearchResponse>
  searchTags(scope?: 'span' | 'resource' | 'intrinsic', opts?: ReadOpts): Promise<string[]>
  searchTagValues(tag: string, opts?: ReadOpts): Promise<string[]>
  getTrace(traceId: string, opts?: ReadOpts): Promise<TraceResponse>
}

interface SearchOpts {
  start?: Date | number
  end?: Date | number
  limit?: number
  spss?: number      // spans per span set
}
```

Targets qryn's Tempo-compatible API: `/api/search`, `/api/search/tags`, `/api/search/tag/{tag}/values`, `/api/traces/{traceId}`.

**Acceptance**
- TraceQL search returns trace summaries with traceId, rootServiceName, rootTraceName, durationMs, startTimeUnixNano, spanCount
- `getTrace` returns the full OTLP trace as parsed JSON; preserve span tree relationships
- All four methods accept `signal`, `timeoutMs`, retry config

### P2 — quality of life, not blocking

#### 7. Test harness

```
qryn-client/
├── test/
│   ├── unit/                 # mocked axios
│   ├── integration/          # against docker-compose
│   └── fixtures/
├── docker-compose.test.yml   # qryn + ClickHouse + seed
└── .github/workflows/test.yml
```

**Acceptance**
- `npm test` runs unit + integration locally
- GitHub Actions CI runs the same on every PR
- Coverage of public API >70% lines

#### 8. Error normalization

Replace ad-hoc throws with a typed error hierarchy:

```ts
class QrynError extends Error { code: string; cause?: unknown }
class QrynBadRequestError extends QrynError { status: 400|404|422; body: any }
class QrynServerError extends QrynError { status: 500|502|503|504; body: any }
class QrynNetworkError extends QrynError { underlying: any }
class QrynTimeoutError extends QrynError { elapsedMs: number }
class QrynAbortedError extends QrynError { reason?: string }
```

**Acceptance**
- Every HTTP failure produces one of the typed errors above
- The original axios error is preserved as `.cause`
- Documented in README so the MCP can write deterministic try/catch logic

## Release plan

| Milestone | Contents | Target |
|---|---|---|
| `0.2.0` | P0 items (1–5). Breaking change: auth shape | Week 1–2 |
| `0.3.0` | P1: Tempo client | Week 3 |
| `0.4.0` | P2: tests, error normalization | Week 4 |
| `1.0.0` | API freeze; semver from here | After MCP integration confirmed stable |

Pin MCP to a specific commit SHA until 1.0.0.

## Out of scope

- Pyroscope (profiling) support
- OTLP gRPC ingestion
- Prometheus protobuf remote_write
- Read-from-ClickHouse-directly client (separate concern, not blocking v1)
- LogQL `tail` (live streaming) — defer to 1.1

## Notes for upstreaming

These extensions benefit the broader qryn community. Recommend opening PRs against `metrico/qryn-client` rather than fork-and-vendor. Voicenter retains a vendored copy pinned to commit SHA as a safety net while upstream review proceeds. Coordinate with Lorenzo Mangani for review prioritization.
