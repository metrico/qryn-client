# Audit — 2026-05-02

A snapshot of `qryn-client` at commit `d5fbe7b` (main). Performed as part of the coding-agent readiness pass.

This document is a **point-in-time** record. For the live state of agent guidance, see [`../AGENTS.md`](../AGENTS.md). For ongoing follow-ups, see [`todo.md`](todo.md).

## Summary

| Area | Status |
|---|---|
| Documentation completeness | Partial → **fixed in this PR** |
| JSDoc coverage | Partial → **fixed in this PR** |
| Public API surface stability | Mostly stable, one typo bug surfaced |
| Test coverage | None — tracked in `todo.md` |
| CI / release | Functional (`npm_release.yml`) |
| Agent readiness | Missing → **created in this PR** (`AGENTS.md`, `CLAUDE.md`, `.aiexclude`, `docs/`) |

## Documentation gaps (FIXED)

Found in `README.md` at audit time:

| Gap | Resolution |
|---|---|
| Tempo client (`client.tempo`) was entirely undocumented. | Added a "Searching Traces with Tempo" section to `README.md`. |
| `client.createCollector(opts)` — exists in `src/index.js` but README only documents the standalone `new Collector(...)` form. | Documented `createCollector` as the canonical entry. |
| `Collector` options `async`, `fpLimit`, `ttlDays`, `retryAttempts`, `retryDelay`, `cache` were undocumented. README listed only `maxBulkSize`, `maxTimeout`, `orgId`. | Full options table added. |
| `QrynClient` constructor option `headers` (extra default headers) was undocumented. | Added to constructor docs. |
| `Read.queryRange` argument types: README said `start`/`end` were "in seconds" but the example uses `Math.floor(Date.now() / 1000)` and the implementation just forwards values. | Clarified in README that callers must pass Unix-second timestamps. |
| Repository URL placeholder: `package.json` had `https://github.com/username/qryn-client.git`. | Fixed to `https://github.com/metrico/qryn-client.git`. |
| `searchTagValuesV2(tagName, params)` and `getTraceSpansJson(traceID)` (added in commits `5657f28`, `ad6d7d5`) were undocumented. | Documented in the new Tempo section. |

## JSDoc gaps (FIXED)

| File | Gap | Resolution |
|---|---|---|
| `src/clients/tempo.js` | No JSDoc on any method. | Full JSDoc added. |
| `src/utils/collector.js` | `cache` option JSDoc tag points at `LRUCache.Options` but several other tags are misnamed (e.g. `maxEntries` doesn't exist; the field is `maxBulkSize`). | Aligned tags with actual fields. |
| `src/clients/loki.js` | `headers(options)` method had no JSDoc. | Added. |

## Code bugs (FIXED in this PR)

Each item lists the file:line, the broken behavior, and what the fix changes.

### B1 — Swapped `fpLimit` / `ttlDays` headers

- **Files:** [`src/clients/loki.js:59-60`](../src/clients/loki.js#L59-L60), [`src/clients/prometheus.js:213-214`](../src/clients/prometheus.js#L213-L214)
- **Before:**
  ```js
  if (options.fpLimit) headers['X-Ttl-Days']  = options.fpLimit;
  if (options.ttlDays) headers['X-FP-LIMIT']  = options.ttlDays;
  ```
- **After:**
  ```js
  if (options.fpLimit) headers['X-FP-Limit'] = options.fpLimit;
  if (options.ttlDays) headers['X-Ttl-Days'] = options.ttlDays;
  ```
- **Backward-compat note:** Anyone passing `fpLimit` was actually setting a TTL, and vice versa. Behavior changes for both options. If you depended on the swap, update your option names.

### B2 — `QrynResponse.getData()` returned undefined

- **File:** [`src/types/qrynResponse.js:33`](../src/types/qrynResponse.js#L33)
- **Before:** `getData() { return this.data; }` — `this.data` was never assigned; the response body lives on `this.response`.
- **After:** `getData() { return this.response; }`
- **Backward-compat note:** Code that called `.getData()` and checked for truthiness would have always taken the falsy branch. Such code was already broken; the fix surfaces real data.

### B3 — `Http.request()` only parsed body when **request** was form-urlencoded

- **File:** [`src/services/http.js:63-65`](../src/services/http.js#L63-L65)
- **Before:**
  ```js
  if (headers['Content-Type'] === 'application/x-www-form-urlencoded') {
    res = await response.json();
  }
  ```
  This checks the *request* `Content-Type`, so JSON-bodied requests (e.g., Loki push) always returned `response: {}` even on success. Worse, error bodies were also dropped, hiding server-side error detail.
- **After:** parse based on the response `Content-Type` and gracefully handle non-JSON / 204 / empty bodies.
- **Backward-compat note:** Consumers reading the response body directly will start seeing actual content. The `QrynResponse` shape is unchanged — `response` was always meant to hold the body.

### B4 — `Tempo.search()` swallowed errors

- **File:** [`src/clients/tempo.js:15-17`](../src/clients/tempo.js#L15-L17)
- **Before:**
  ```js
  return this.service.request(...).catch(error => {
    console.error('ERROR:', error);
  });
  ```
  Returned `undefined` on failure and broke the `.catch()`-based failover documented for the other clients in the README.
- **After:** errors propagate as `QrynError`, matching the Loki / Prometheus pattern.
- **Backward-compat note:** Code that did `const r = await tempo.search(); if (!r) ...` will now see a thrown error instead of an `undefined` return. Wrap in `try/catch` or `.catch()`.

## Code observations (NOT bugs, kept as-is)

These looked suspicious during the audit but are correct on close reading. Documented here so future agents don't re-investigate.

- **`Loki.push` / `Prometheus.push` validators using `every()` with side-effects.** The `return s` inside the callback runs unconditionally for `instanceof Stream` (or `Metric`) — the indentation is misleading but the behavior is correct: empty streams are silently skipped, non-Stream values fail the `every()` check. Functional but ugly. Could be refactored to a clear two-pass `filter` + `validate`. Tracked as quality polish in `todo.md`.
- **`Stream.collect()` clears `entries`.** Intentional — the snapshot lives in `#collectedEntries` for `undo()` to restore. Do not change without breaking the confirm/undo lifecycle.
- **Collector pushes the entire LRU cache on every flush.** Empty streams/metrics are filtered downstream by the client-side validators, so only models with new data hit the wire. This is intentional and load-bearing for retry semantics.

## Infrastructure

- **CI:** [`.github/workflows/npm_release.yml`](../.github/workflows/npm_release.yml) publishes on GitHub Release events. Functional. Uses `secrets.NPM_TOKEN`.
- **Dependabot:** Configured in `.github/dependabot.yml` (not inspected; assumed minimal).
- **No PR validation workflow** — no test, no lint, no type check on PRs. Tracked in `todo.md`.
- **No `package-lock.json`** is committed. This is intentional per the gitignore. If you bump dependencies, do not commit a lockfile.
- **Node engine:** `>=18.0.0` (uses `fetch`, `AbortSignal.timeout`). Don't drop the engine constraint.

## Agent-readiness gaps (FIXED in this PR)

- No `AGENTS.md`, no `CLAUDE.md`, no agent ignore file, no architecture doc → all created.
- README was the only entry for both humans and agents → still primary for humans; agents now have `AGENTS.md`.
- No JSDoc on Tempo → fixed.

## What's left

See [`todo.md`](todo.md).
