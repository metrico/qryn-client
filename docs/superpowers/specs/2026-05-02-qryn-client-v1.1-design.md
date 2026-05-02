# qryn-client v1.1.0 — design

**Date:** 2026-05-02
**Owner:** Shlomi Gutman
**Status:** Draft, awaiting user approval
**Source spec:** [docs/refreance/qryn-client-extensions-requirements.md](../../refreance/qryn-client-extensions-requirements.md)

## Goal

Land the P0 + P1 deliverables from the qryn-client extensions requirements as a single non-breaking minor release (v1.1.0). The release unblocks the Voicenter qryn-MCP build (P0) and gives the MCP its trace surface (P1). P2 (test harness, full error hierarchy) is deferred to a later brainstorm.

## Decisions locked during brainstorm

| # | Decision | Choice | Reason |
|---|---|---|---|
| 1 | TypeScript approach | Ship `.d.ts` only via `tsc --declaration --allowJs --emitDeclarationOnly` | Honors AGENTS.md (plain JS, no TS) and the recorded "Will not do" in [docs/todo.md](../../todo.md). Satisfies the source spec's `.d.ts` clause and the MCP's `tsc --noEmit --strict` consumer check. |
| 2 | Scope | P0 + P1 in this design | P1 is small because Tempo client already exists; P2 is genuinely separable (testing infra + error hierarchy). |
| 3 | Auth migration | Soft — accept old `{username, password}` shape with `process.emitWarning` deprecation; remove in 2.0.0 | Vendored MCP copy is SHA-pinned (per source spec); other v1.x consumers get a clear migration path; minor version bump suffices. |
| 4 | Reader response shape | `QrynResponse<T>` with typed payload via `.d.ts` generics | Non-breaking for v1.x consumers; the source spec's "not raw axios" complaint is satisfied because `QrynResponse` is *our* envelope; avoids two coexisting return patterns. |

## Reality reconciliation

The source spec's "Current state" paragraph is dated. Confirmed actual state:

- Library is published as `qryn-client` v1.0.10 ([package.json](../../../package.json)).
- HTTP layer uses native `fetch` + `AbortSignal.timeout` ([src/services/http.js](../../../src/services/http.js)). No axios. Implementation references in the source spec to `axios-retry` and "axios's `signal` parameter" must be adapted to fetch.
- `TempoClient` exists ([src/clients/tempo.js](../../../src/clients/tempo.js)) with `search`, `searchTagValuesV2`, `getTraceSpansJson`. P1 work is alignment + new methods, not greenfield.
- `Prometheus.Read` reader exists ([src/clients/prometheus.js](../../../src/clients/prometheus.js)).
- Auth is HTTP Basic only via `{username, password}` ([src/services/http.js:32](../../../src/services/http.js)).
- JSDoc is in place across the public surface; no `.d.ts` is emitted today.
- No test suite; smoke validation is via `example/*.js`.

The source spec's release table (0.2.0 → 1.0.0) is therefore void. We ship as **v1.1.0**.

## Architecture

`QrynClient` continues to compose sub-clients sharing a single `Http` instance. The change is in three layers:

```
QrynClient (defaultOrgId, retry, auth, timeout, headers)
  │
  └─► Http (per-call: signal, timeoutMs, retry, orgId, authResolver)
        │
        ├─ loki   ── push (existing) + createReader() ──► LokiReader (new)
        ├─ prom   ── push (existing) + createReader() ──► PromReader (existing, opts plumbed)
        └─ tempo  ── search/searchTagValuesV2/getTraceSpansJson (existing) +
                    searchTags + searchTagValues (new) + getTrace (alias of getTraceSpansJson)
```

Per-call options always override per-instance defaults. Existing call sites (e.g. `loki.push(streams, { orgId })`) continue to work unchanged.

## Components

### 1. HTTP layer — per-call options + retry + signals

[src/services/http.js](../../../src/services/http.js) gains a per-call options pipeline:

```js
http.request(path, {
  method, headers, body,    // existing
  signal,                    // NEW — caller AbortSignal
  timeoutMs,                 // NEW — overrides instance timeout for THIS request
  retry,                     // NEW — RetryOptions; overrides instance default
  orgId,                     // NEW — sets X-Scope-OrgID, overrides defaultOrgId
  authResolver               // NEW — optional override for the resolved auth headers
})
```

**Signal handling.** Each attempt computes its effective signal as `AbortSignal.any([callerSignal, AbortSignal.timeout(effectiveTimeoutMs)])`. `AbortSignal.any` is available in Node 20+; for Node 18 we ship a small polyfill in `src/utils/abort.js` that registers a one-time abort listener on the caller signal and forwards to a controller wrapping the timeout signal.

When `fetch` rejects with `AbortError`:
- If the caller signal is aborted → throw `QrynAbortedError(reason)`.
- Otherwise (timeout) → throw `QrynTimeoutError(elapsedMs)`.

These two new error classes are added to [src/types](../../../src/types/) and exported from `index.js`. They extend `QrynError`. The full `QrynBadRequestError`/`QrynServerError`/`QrynNetworkError` hierarchy from the source spec stays in P2.

**Retry policy.**

```ts
interface RetryOptions {
  attempts: number;             // default 3 (1 try + 2 retries)
  baseDelayMs: number;          // default 200
  maxDelayMs: number;           // default 5_000
  retryOn?: (status: number, attempt: number) => boolean;
}
```

Default retry condition (when `retryOn` is not supplied):
- Network errors: `ECONNREFUSED`, `ECONNRESET`, `ETIMEDOUT`, `EAI_AGAIN`.
- HTTP statuses: `408`, `429`, `502`, `503`, `504`.
- Honor `Retry-After` on `429` (seconds OR HTTP-date).
- Never retry on caller abort (`QrynAbortedError`).
- Never retry on `4xx` other than `408` and `429`.

Backoff: `min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1))` with full jitter (`Math.random() * delay`). When `Retry-After` is present on a `429`, use that value instead of computed backoff.

**Per-attempt timeout budget.** Each attempt receives the full `timeoutMs` — retries do not double-count against the caller's deadline. A separate caller-supplied signal will still abort the entire chain at any moment.

**Hand-rolled, no new deps.** `axios-retry` is rejected; we implement a small `retryRequest(http, path, options)` helper inside `Http`.

### 2. Auth — discriminated union with soft migration

`QrynClientOptions` becomes:

```ts
interface QrynClientOptions {
  baseUrl?: string;                       // default 'http://localhost:3100'
  auth?: QrynAuth;                        // discriminated union below
  headers?: Record<string,string>;        // merged before auth headers
  timeout?: number;                       // default per-call timeoutMs (default 60_000)
  retry?: RetryOptions;                   // instance default
  defaultOrgId?: string;                  // default X-Scope-OrgID
}

type QrynAuth =
  | { type: 'basic',  username: string, password: string }
  | { type: 'bearer', token: string | (() => Promise<string>) }
  | { type: 'custom', headers: Record<string,string> | (() => Promise<Record<string,string>>) };
```

`Http` gains an `async #resolveAuthHeaders()` method:
- `'basic'` → returns `{ Authorization: 'Basic ' + base64(user:pass) }`.
- `'bearer'` → resolves token (string or thunk) → `{ Authorization: 'Bearer ' + token }`. Thunk is awaited each request.
- `'custom'` → returns the headers map, awaiting the thunk if necessary.

**Default timeout** rises from 5000 ms (current) to 60_000 ms to match the source spec acceptance for #3 ReadOpts. Push paths continue to honor the same default; consumers who relied on a 5 s push timeout can override per-call.

**Back-compat shim.** In the `QrynClient` constructor, before passing to `Http`:

```js
if (auth && !auth.type && auth.username !== undefined) {
  process.emitWarning(
    "qryn-client: auth: { username, password } is deprecated; use auth: { type: 'basic', username, password }. The legacy shape will be removed in 2.0.0.",
    'DeprecationWarning',
    'QRYN_AUTH_LEGACY'
  );
  auth = { type: 'basic', username: auth.username, password: auth.password };
}
```

`emitWarning` is fired with a unique code so consumers can suppress it (`--no-warnings=DeprecationWarning` or filtering by code).

`auth` is optional throughout — an unauthenticated client is valid for local dev.

### 3. LokiReader — new client

New file [src/clients/loki-read.js](../../../src/clients/loki-read.js) plus a factory on the existing Loki client:

```js
// in src/clients/loki.js
createReader(options = {}) {
  return new LokiReader(this.service, options);
}
```

```js
// src/clients/loki-read.js
class LokiReader {
  constructor(service, options) { this.service = service; this.options = options; }

  async query(query, time, opts) { /* GET /loki/api/v1/query */ }
  async queryRange(query, start, end, step, limit, direction, opts) {
    /* GET /loki/api/v1/query_range */
  }
  async labels(start, end, opts)                     { /* GET /loki/api/v1/labels */ }
  async labelValues(label, start, end, match, opts)  { /* GET /loki/api/v1/label/{label}/values */ }
  async series(matchers, start, end, opts)           { /* GET /loki/api/v1/series */ }
}
```

**Endpoints** are GET with query-string params, matching what Grafana's Loki datasource sends:

| Method | Path | Notable params |
|---|---|---|
| `query` | `/loki/api/v1/query` | `query`, `time` (ns) |
| `queryRange` | `/loki/api/v1/query_range` | `query`, `start` (ns), `end` (ns), `step`, `limit`, `direction` |
| `labels` | `/loki/api/v1/labels` | `start` (ns), `end` (ns) |
| `labelValues` | `/loki/api/v1/label/{label}/values` | `start`, `end`, `query` (matcher) |
| `series` | `/loki/api/v1/series` | repeated `match[]`, `start`, `end` |

**Time normalization.** New util [src/utils/time.js](../../../src/utils/time.js) exports `toNanos(input: Date | number | string): string`. Rules:
- `Date` → `(date.getTime() * 1e6).toString()`.
- Integer `number` heuristic: `< 1e12` → seconds; `< 1e15` → milliseconds; otherwise nanoseconds. Each is multiplied to nanoseconds and emitted as a string to preserve precision.
- `string` is returned unchanged (assume caller knows the unit).

This addresses the source spec acceptance "Time params accept Date and unix-seconds number; nanosecond precision preserved for log timestamps."

**ReadOpts.** All five methods accept a final `opts?: ReadOpts` argument:

```ts
interface ReadOpts {
  signal?: AbortSignal;
  timeoutMs?: number;
  retry?: RetryOptions;
  orgId?: string;
}
```

`opts.orgId` overrides the per-instance `options.orgId` from `createReader`, which itself overrides client-level `defaultOrgId`.

**Returns.** Every method returns `Promise<QrynResponse<T>>` per Q4-C. The `T` is one of the spec's named types (`LokiInstantResponse`, `LokiRangeResponse`, `string[]`, `SeriesResponse`). Runtime returns the raw envelope; the typed payload is expressed only in `.d.ts`.

**Streams not materialized beyond `limit`.** The Loki API itself caps at `limit`; the client passes the parameter through. Live streaming (`tail`) is explicitly out of scope.

### 4. PromReader — opts plumbing

The existing [Read](../../../src/clients/prometheus.js) class gains an optional trailing `opts: ReadOpts` on each method (signal/timeoutMs/retry/orgId), forwarded to `Http.request`. Method signatures otherwise unchanged. Backward compatible.

### 5. Tempo alignment

Additions to [src/clients/tempo.js](../../../src/clients/tempo.js):

| Surface | Status | Detail |
|---|---|---|
| `search(query, opts)` | Existing — generalize | First argument retains the existing meaning (raw query string fragment or `URLSearchParams`) for back-compat. New callers pass a `SearchOpts` object (`{ q, start, end, limit, spss }`); the implementation discriminates on the input type. `q` is the TraceQL query; the helper builds the query string from the object's fields. |
| `searchTags(scope?, opts?)` | NEW | `GET /api/search/tags?scope=` (scope = `'span'\|'resource'\|'intrinsic'`). |
| `searchTagValues(tag, opts?)` | NEW | `GET /api/search/tag/{tag}/values`. v1 path. |
| `searchTagValuesV2` | Existing | Keep as-is. |
| `getTrace(traceId, opts?)` | NEW alias | Thin alias of `getTraceSpansJson` to match the source spec name. Old method retained. |

All methods grow `opts.signal`, `opts.timeoutMs`, `opts.retry`, `opts.orgId`. `searchParams` continues to accept `string | URLSearchParams` for back-compat.

Returned shape per Q4-C: `Promise<QrynResponse<T>>` where `T` is `TempoSearchResponse`, `string[]`, or `TraceResponse`.

### 6. Type emission (`.d.ts`)

Add to [package.json](../../../package.json):

```json
{
  "types": "index.d.ts",
  "files": ["src", "index.d.ts", "dist/types"],
  "scripts": {
    "build:types": "tsc --declaration --allowJs --emitDeclarationOnly --target ES2020 --module commonjs --moduleResolution node --outDir dist/types src/index.js",
    "test:types": "tsc --noEmit --strict tests/types/consumer-smoke.ts"
  },
  "devDependencies": {
    "typescript": "^5.4.0"
  }
}
```

Keep a hand-written **[index.d.ts](../../../index.d.ts)** at the repo root that:
1. Re-exports everything from `dist/types/index.d.ts` (the JSDoc-derived part).
2. Augments with the named types JSDoc cannot express precisely:
   `QrynAuth`, `RetryOptions`, `ReadOpts`, `LokiInstantResponse`, `LokiRangeResponse`, `SeriesResponse`, `TempoSearchResponse`, `TraceResponse`, `QrynResponse<T>` (generic).

The release workflow ([.github/workflows/npm_release.yml](../../../.github/workflows/npm_release.yml)) runs `npm run build:types` before `npm publish`. CI runs `npm run test:types` to verify the consumer-smoke compiles under `--strict`.

`tsconfig.json` is committed at the repo root with the bare-minimum config needed for the two scripts above; not used at runtime.

### 7. Validation approach

No test suite exists yet (deferred to P2). For this branch:

- **Type smoke (CI).** [tests/types/consumer-smoke.ts](../../../tests/types/consumer-smoke.ts) imports the public API and exercises every new surface (basic/bearer/custom auth, `loki.createReader().queryRange(...)`, `tempo.searchTags(...)`, `ReadOpts`). Runs in CI as `npm run test:types`.
- **Runtime smoke (manual).** [example/loki-read.js](../../../example/loki-read.js) (new), and additions to [example/read.js](../../../example/read.js) and [example/tempo.js](../../../example/tempo.js) (new) — driven by env vars, not part of CI.
- **Existing baseline.** `node -e "require('./src')"` continues to pass on every commit.

## Public API delta (for consumers)

```js
// New on QrynClient constructor
new QrynClient({
  baseUrl, headers, timeout,
  auth: { type: 'basic'|'bearer'|'custom', ... },   // NEW shape
  retry: { attempts, baseDelayMs, maxDelayMs, retryOn },   // NEW
  defaultOrgId: 'tenant-a'                          // NEW
});

// NEW
client.loki.createReader({ orgId? }).queryRange(q, start, end, step, limit, dir, opts);
client.loki.createReader({ orgId? }).labels(start, end, opts);
client.loki.createReader({ orgId? }).labelValues(label, start, end, match, opts);
client.loki.createReader({ orgId? }).series(matchers, start, end, opts);
client.loki.createReader({ orgId? }).query(q, time, opts);

// NEW on Tempo
client.tempo.searchTags(scope?, opts?);
client.tempo.searchTagValues(tag, opts?);
client.tempo.getTrace(traceId, opts?);   // alias

// NEW errors
QrynAbortedError, QrynTimeoutError    // exported from index.js
```

`opts` everywhere = `{ signal?, timeoutMs?, retry?, orgId? }`.

## Files touched

| Path | Change |
|---|---|
| [src/index.js](../../../src/index.js) | Constructor: accept new options, run auth back-compat shim, pass through to `Http`, expose new errors. |
| [src/services/http.js](../../../src/services/http.js) | Per-call options pipeline, retry, signal combination, abort/timeout error mapping. |
| [src/clients/loki.js](../../../src/clients/loki.js) | Add `createReader()`. Existing `push` behavior unchanged. |
| **[src/clients/loki-read.js](../../../src/clients/loki-read.js)** (new) | `LokiReader` class. |
| [src/clients/prometheus.js](../../../src/clients/prometheus.js) | Plumb `opts` through `Read` methods; no signature break. |
| [src/clients/tempo.js](../../../src/clients/tempo.js) | New methods `searchTags`, `searchTagValues`, `getTrace`; per-call opts on existing methods. |
| **[src/utils/time.js](../../../src/utils/time.js)** (new) | `toNanos` helper. |
| **[src/utils/abort.js](../../../src/utils/abort.js)** (new) | `AbortSignal.any` shim for Node 18. |
| [src/types/index.js](../../../src/types/index.js) | Export `QrynAbortedError`, `QrynTimeoutError`. |
| **[src/types/qrynAbortedError.js](../../../src/types/qrynAbortedError.js)** (new) | New error class. |
| **[src/types/qrynTimeoutError.js](../../../src/types/qrynTimeoutError.js)** (new) | New error class. |
| **[index.d.ts](../../../index.d.ts)** (new) | Hand-written augmentation + re-export of generated types. |
| **[tsconfig.json](../../../tsconfig.json)** (new) | Minimal config for `tsc --declaration`. |
| [package.json](../../../package.json) | `types`, `files`, scripts, devDep on `typescript`. Bump version to 1.1.0. |
| **[tests/types/consumer-smoke.ts](../../../tests/types/consumer-smoke.ts)** (new) | Strict type-check the public surface. |
| **[example/loki-read.js](../../../example/loki-read.js)** (new) | Manual smoke. |
| [example/tempo.js](../../../example/tempo.js) (new or extend) | Manual smoke for new tempo surface. |
| [README.md](../../../README.md) | Document new auth shape, `createReader` for Loki, Tempo additions, retry/abort. |
| [docs/architecture.md](../../../docs/architecture.md) | Update HTTP/auth section. |

## Out of scope

- Full `QrynBadRequestError` / `QrynServerError` / `QrynNetworkError` error hierarchy (P2).
- Test harness — unit + integration + docker-compose (P2).
- LogQL `tail` (live streaming).
- Pyroscope / OTLP gRPC / Prometheus protobuf remote_write surface changes.
- TypeScript source migration (recorded "Will not do" in [docs/todo.md](../../todo.md)).

## Risks and notes

- **`AbortSignal.any` polyfill.** Must be exercised in CI against the Node 18 version. We ship a small implementation; bug there means timeouts and caller aborts become tangled. Type-smoke does not catch this — needs an example/ smoke at minimum.
- **Default timeout change (5 s → 60 s).** The current default is too low for analytic queries; raising it matches the source spec but is a behavioral change for v1.x users who relied on the 5 s cap. Document in README "Migration to 1.1.0" section.
- **Hand-written `index.d.ts` over generated.** Keeping a hand-written file means the source-of-truth is split (JSDoc + index.d.ts). Acceptable cost for typed `QrynResponse<T>` and the named response shapes JSDoc cannot express. If JSDoc gains generic support adequate to our needs later, fold the hand-written portion back.
- **`process.emitWarning` for auth deprecation.** Emitted once per process via the `QRYN_AUTH_LEGACY` code. Test suites that capture `process.on('warning', ...)` may see new noise. Documented in README.
