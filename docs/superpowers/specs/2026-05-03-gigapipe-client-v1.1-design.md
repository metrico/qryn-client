# gigapipe-client v1.1.0 — design (port to rebranding)

**Date:** 2026-05-03
**Owner:** Shlomi Gutman
**Status:** Approved for implementation
**Source spec:** [docs/refreance/qryn-client-extensions-requirements.md](../../refreance/qryn-client-extensions-requirements.md)
**Origin:** Adapted from [docs/refreance/v1.1-spec.md](../../refreance/v1.1-spec.md) — itself a v1.1 design originally written against the qryn-named main; this document re-bases the same design on the `rebranding` branch (gigapipe naming).

## Goal

Port the v1.1 P0+P1 deliverables onto the `rebranding` branch as a non-breaking minor release of `gigapipe-client`. Preserve everything rebranding already does (renaming, tests, `parseLogs`); add only what is missing.

## Why a port and not a cherry-pick

The original 35 commits were authored on top of `main` (qryn-named). The rebranding branch renames the package and types to `gigapipe-client` / `Gigapipe*` and introduces overlapping work (its own `Loki.createReader`, its own test harness). A cherry-pick would conflict on every renamed file. Cleaner: re-implement the same feature set on top of rebranding, named consistently, with conflicts resolved by design rather than `<<<<<<<` markers.

## What rebranding already has (do not re-implement)

| Feature | Where |
|---|---|
| `Gigapipe*` package & class naming | Throughout |
| `GigapipeError`, `GigapipeResponse` | `src/types/` |
| `Loki.createReader().{query,queryRange,labels,labelValues,series}` (basic, no opts) | `src/clients/loki.js` |
| `Loki.parseLogs` static helper | `src/clients/loki.js` |
| `Prometheus.createReader().{query,queryRange,labels,labelValues,series,rules}` (basic, no opts) | `src/clients/prometheus.js` |
| `Tempo.{search, searchTagValuesV2, getTraceSpansJson}` | `src/clients/tempo.js` |
| `node:test` harness + 5 test files | `test/*.test.js` |
| `Stream`, `Metric`, `Collector` models | `src/models/`, `src/utils/` |
| Native `fetch` HTTP layer with `AbortSignal.timeout` | `src/services/http.js` |

## What is missing (the work)

Direct mapping from the source spec's P0/P1 acceptance to rebranding gaps:

| Source-spec requirement | Status on rebranding | Action |
|---|---|---|
| **P0-1** Loki reader (5 methods) | Present, but no `signal`/`timeoutMs`/`retry`/`orgId` ReadOpts | Plumb `opts` through; preserve existing `parse` flag |
| **P0-2** TypeScript `.d.ts` | Absent | Hand-written `index.d.ts` + `tsc --noEmit --strict` consumer smoke |
| **P0-3** AbortSignal on every read | Absent (timeout-only) | Combine caller signal with timeout via `AbortSignal.any` (Node 18 polyfill) |
| **P0-4** Retry/backoff with sane defaults | Absent | Hand-rolled retry loop with backoff + jitter + `Retry-After` |
| **P0-5** Pluggable auth (basic/bearer/custom) | Basic-only via `{username, password}` | Discriminated union + thunk support + back-compat shim |
| **P1-6** Tempo `search/searchTags/searchTagValues/getTrace` | `search` + `searchTagValuesV2` + `getTraceSpansJson` exist; `searchTags`, v1 `searchTagValues`, `getTrace` alias missing | Add the three; align signatures |
| **P0-Errors** `GigapipeAbortedError`, `GigapipeTimeoutError` | Absent | Add classes; throw from HTTP layer |
| **defaultOrgId** at client level | Absent | New constructor option, plumbed to HTTP |

## Architecture

```
GigapipeClient (defaultOrgId, retry, auth, timeout, headers)
  │
  └─► Http (per-call: signal, timeoutMs, retry, orgId, authResolver)
        │
        ├─ Loki      ── push (existing) + createReader() ──► Read (existing class, opts plumbed)
        ├─ Prometheus── push (existing) + createReader() ──► Read (existing class, opts plumbed)
        └─ Tempo     ── search/searchTagValuesV2/getTraceSpansJson (existing) +
                        searchTags + searchTagValues + getTrace (new) — opts plumbed everywhere
```

**Precedence rule for opts** (highest wins): per-call `opts.x` → reader-instance `options.x` (`createReader({orgId})`) → constructor `defaultX` → built-in default.

## Decisions locked

| # | Decision | Choice | Reason |
|---|---|---|---|
| 1 | Naming for new errors | `GigapipeAbortedError`, `GigapipeTimeoutError` | Match rebranding |
| 2 | TypeScript approach | Hand-written `index.d.ts`, no source migration | Matches the recorded "Will not do" decision; `tsc --noEmit --strict` consumer check is the contract |
| 3 | Auth migration | Soft — accept `{username, password}` (current rebranding shape), emit `DeprecationWarning`, treat as `{type:'basic',...}` | Vendored MCP copy is SHA-pinned per source spec; minor bump suffices |
| 4 | Reader response shape | Continue returning `GigapipeResponse<T>`; T is expressed in `.d.ts` only | Non-breaking; rebranding already does this |
| 5 | Default timeout | Keep current `5000` ms default (rebranding behavior); `timeoutMs` per-call available for long queries | "Leave the project pretty much in the same state" — no behavioral change to existing consumers |
| 6 | Retry deps | Hand-rolled, no new deps | Matches AGENTS.md "no unnecessary deps" |
| 7 | Test framework | `node:test` (already in rebranding) | Match existing pattern |
| 8 | Test directory | `test/` (singular, rebranding's pattern) | Match existing |
| 9 | Auth thunk caching | Resolved per-request (no caching) | Spec acceptance: "callers can refresh from a token store on each request" |
| 10 | `searchTagValuesV2` retention | Keep alongside new v1 `searchTagValues` | Back-compat for current rebranding consumers |

## Public API delta (consumer-visible)

```js
// New on GigapipeClient constructor
new GigapipeClient({
  baseUrl, headers, timeout,
  auth: { type: 'basic'|'bearer'|'custom', ... },   // NEW shape (old shape still accepted with warning)
  retry: { attempts, baseDelayMs, maxDelayMs, retryOn },  // NEW
  defaultOrgId: 'tenant-a'                          // NEW
});

// All methods accept a final ReadOpts arg: { signal?, timeoutMs?, retry?, orgId? }
client.loki.push(streams, opts);
client.loki.createReader({ orgId? }).query(q, opts);
client.loki.createReader({ orgId? }).queryRange(q, start, end, queryOptions, opts);
client.loki.createReader({ orgId? }).labels(queryOptions, opts);
client.loki.createReader({ orgId? }).labelValues(label, queryOptions, opts);
client.loki.createReader({ orgId? }).series(match, queryOptions, opts);
client.prom.push(metrics, opts);
client.prom.createReader({ orgId? }).query(q, opts);
client.prom.createReader({ orgId? }).queryRange(q, start, end, step, opts);
client.prom.createReader({ orgId? }).labels(opts);
client.prom.createReader({ orgId? }).labelValues(label, opts);
client.prom.createReader({ orgId? }).series(match, start, end, opts);
client.prom.createReader({ orgId? }).rules(opts);
client.tempo.search(searchParamsOrOpts, opts);
client.tempo.searchTags(scope?, opts);                   // NEW
client.tempo.searchTagValues(tag, opts);                 // NEW
client.tempo.searchTagValuesV2(tag, searchParams, opts); // existing, opts plumbed
client.tempo.getTrace(traceId, opts);                    // NEW alias
client.tempo.getTraceSpansJson(traceId, opts);           // existing, opts plumbed

// New exports
const { GigapipeAbortedError, GigapipeTimeoutError } = require('gigapipe-client');
```

## Risks

- **`AbortSignal.any` polyfill** — Node 20+ has it native; Node 18 needs a shim. Bug there entangles caller-abort with timeout-abort. Mitigation: dedicated unit tests for the polyfill, exercised against Node 18 in CI.
- **Auth back-compat shim** — emits `DeprecationWarning` once per process; tooling that captures warnings may see new noise. Documented in README.
- **`fetch` AbortError disambiguation** — `fetch` rejects with `AbortError` for both caller-aborts and timeouts. We must inspect the *caller* signal's state at error time to decide which typed error to throw.
- **Retry semantics** — `Retry-After` may be either delta-seconds or HTTP-date. Both supported; tests cover both.
- **Per-attempt timeout budget** — each attempt gets a fresh `timeoutMs`; retries do NOT subtract from caller deadline. Caller-supplied signal aborts the entire chain.

## Out of scope

- Full `GigapipeBadRequestError` / `GigapipeServerError` / `GigapipeNetworkError` hierarchy (P2).
- Integration test harness against docker-compose (P2).
- LogQL `tail` (live streaming).
- Pyroscope / OTLP gRPC / Prometheus protobuf remote_write changes.
- TypeScript source migration.
