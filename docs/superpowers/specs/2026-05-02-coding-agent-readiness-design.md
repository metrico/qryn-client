# Coding-Agent Readiness — Design

**Date:** 2026-05-02
**Status:** Approved (verbal, auto mode)
**Repo:** qryn-client (Node.js client library for qryn observability backend)

## Goal

Prepare this repository so that coding agents (Claude Code, Codex, Cursor, Copilot, Aider, etc.) can safely maintain and extend it without re-deriving conventions on every task. Produce an audit, fix the gaps, and put a single source of truth in front of any agent that opens the project.

## Decisions

| # | Decision | Rationale |
|---|---|---|
| 1 | Use `AGENTS.md` as the cross-tool standard; `CLAUDE.md` is a thin pointer to it. | Avoids duplicating instructions across vendor-specific files. |
| 2 | Audit + fix the README + JSDoc completeness pass (Approach D from brainstorm). | Library is too small (~600 LOC) for a full `docs/` tree; JSDoc + README + AGENTS is right-sized. |
| 3 | Fix all real bugs found during the audit, with backward compatibility preserved. | Bug fixes are in scope. Behavior-changing fixes are noted in the relevant section of `docs/AUDIT.md` so consumers can spot them in the changelog/PR. |
| 4 | AGENTS.md depth = "Operational" (~200 lines): includes architecture, lifecycle invariants, known pitfalls, agent boundaries, and a recipe for adding a new client. | Captures the non-obvious context an agent cannot infer from reading code. |
| 5 | No test suite added in this PR. Out of scope. | The audit will note absence of tests as a gap; adding them is a separate effort. |

## Deliverables

### Created
- `AGENTS.md` — primary agent guidance (single source of truth).
- `CLAUDE.md` — pointer to `AGENTS.md`, plus any Claude Code-specific notes.
- `docs/AUDIT.md` — snapshot audit grouped by area (docs, code, infra, agent-readiness).
- `docs/architecture.md` — one-page mental model of the data flow and lifecycles.
- `docs/todo.md` — short post-fix backlog (anything left unaddressed in this PR).
- `.aiexclude` — paths agents should not load into context (mirrors `.gitignore` plus secrets-shaped paths).

### Updated
- `README.md` — adds Tempo section, full Collector options table, documents `createCollector` and `headers` config, reconciles divergent examples.
- `package.json` — fix placeholder GitHub URL (`username/qryn-client.git` → `metrico/qryn-client.git`).
- `src/clients/loki.js` — fix header swap (`fpLimit` → `X-FP-Limit`, `ttlDays` → `X-Ttl-Days`); add JSDoc.
- `src/clients/prometheus.js` — same header swap fix.
- `src/clients/tempo.js` — throw `QrynError` instead of `console.error`-and-swallow; add full JSDoc; honor `orgId` in headers.
- `src/services/http.js` — parse response body based on **response** content-type, not request content-type; handle 204/empty bodies.
- `src/types/qrynResponse.js` — fix `getData()` typo (`this.data` → `this.response`); fix `toString()`'s undefined `this.type`/`this.data`.

## Architecture (one-page)

```
                         ┌──────────────┐
                         │ QrynClient   │
                         └──────┬───────┘
                  ┌─────────────┼─────────────┐
                  ▼             ▼             ▼
            ┌─────────┐  ┌────────────┐  ┌─────────┐
            │  Loki   │  │ Prometheus │  │  Tempo  │
            │ (logs)  │  │  (metrics) │  │ (traces)│
            └────┬────┘  └─────┬──────┘  └────┬────┘
                 │             │              │
                 └─────────────┼──────────────┘
                               ▼
                         ┌──────────┐
                         │   Http   │ ← shared transport
                         └──────────┘

  Stream  ──addEntry──▶  collect ──▶ Loki.push  ──confirm/undo──┐
  Metric  ──addSample─▶  collect ──▶ Prom.push  ──confirm/undo──┤
                                                                │
  Collector wraps QrynClient ──▶ LRU-caches Stream/Metric by key
                              ──▶ flushes on size OR timeout
                              ──▶ retries with exponential backoff
                              ──▶ emits 'info' / 'error' events
```

### Lifecycle invariants (CRITICAL)

`Stream` and `Metric` carry an in-flight buffer for the optimistic push pattern:

1. `addEntry` / `addSample` → buffers in `entries` / `samples`.
2. `collect()` → snapshots and **clears** the buffer; result goes on the wire.
3. `confirm()` (after server 2xx) → discards the snapshot.
4. `undo()` (after error) → prepends the snapshot back so the next push retries it.

**An agent must not break this contract.** If a new client subclass consumes a `Stream`/`Metric`, it MUST call `confirm()` on success and `undo()` on failure. Failing to call either leaks data.

## Known issues (now fixed in this PR)

These were behavior changes; consumers depending on the broken behavior would have been broken anyway. Each is documented in `docs/AUDIT.md` with file:line + before/after.

- `fpLimit` and `ttlDays` collector options were mapped to swapped HTTP headers in both Loki and Prometheus push paths.
- `QrynResponse.getData()` returned `undefined` because it referenced `this.data` (no such field; the data field is `this.response`).
- `Http.request()` only parsed the response body when the **request** content-type was `application/x-www-form-urlencoded`. Most successful responses arrived with `response: {}`.
- `Tempo.search()` swallowed errors via `console.error` instead of throwing, breaking the failover-via-`.catch()` pattern documented in the README.

## Out of scope

- Test suite (no harness exists; adding one is a separate effort tracked in `docs/todo.md`).
- TypeScript migration / `.d.ts` generation.
- API surface changes (renames, new endpoints).
- Restructuring `src/` layout.

## Success criteria

1. An agent given the prompt "add a new Tempo endpoint" can do so by reading only `AGENTS.md` + the existing Tempo client.
2. The four bugs above are fixed; manual smoke via `example/index.js` against a live qryn instance still works.
3. `README.md` documents every public method that exists in `src/`.
4. `git log --oneline` after the PR shows one commit per logical change (docs commit, bugfix commits separated).
