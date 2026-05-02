# AGENTS.md

Guidance for any coding agent (Claude Code, Codex, Cursor, Copilot, Aider, etc.) working in this repository.

This file is the **single source of truth** for agents. `CLAUDE.md` and any vendor-specific config files point here.

---

## 1. Project overview

`qryn-client` is the official Node.js client for [qryn](https://qryn.dev), a polyglot observability backend that speaks Loki (logs), Prometheus remote-write + query (metrics), and Tempo (traces).

The library is a thin wrapper around `fetch` that:
- Buffers logs, metrics, and traces into model objects (`Stream`, `Metric`).
- Pushes them to qryn endpoints with optimistic confirm/undo semantics.
- Optionally batches via a `Collector` that flushes on size or timeout.
- Encodes Prometheus remote-write payloads with protobuf + snappy.

Pure CommonJS, Node ≥ 18 (uses native `fetch` and `AbortSignal.timeout`).

---

## 2. Repository layout

```
qryn-client/
├─ src/
│  ├─ index.js                  # QrynClient (entry); composes Loki/Prom/Tempo + Http
│  ├─ clients/
│  │  ├─ loki.js                # Loki push (logs)
│  │  ├─ prometheus.js          # Prometheus push (remote-write) + Read class (PromQL)
│  │  └─ tempo.js               # Tempo search + trace fetch
│  ├─ models/
│  │  ├─ index.js               # exports Metric, Stream
│  │  ├─ stream.js              # Stream model — log entries with confirm/undo lifecycle
│  │  └─ metric.js              # Metric model — samples with confirm/undo lifecycle
│  ├─ services/
│  │  ├─ http.js                # fetch wrapper, basic auth, timeouts, error normalization
│  │  ├─ protobuff.js           # protobufjs + snappy encoder for remote-write
│  │  └─ remote.proto           # vendored Prometheus remote-write schema (DO NOT edit)
│  ├─ types/
│  │  ├─ index.js               # exports QrynError, QrynResponse, NetworkError, ValidationError
│  │  ├─ qrynError.js           # error class with statusCode + cause + path
│  │  └─ qrynResponse.js        # response wrapper with isSuccess, headers helpers
│  └─ utils/
│     └─ collector.js           # batches Streams/Metrics, LRU cache, retries, EventEmitter
├─ example/                     # smoke scripts driven by env vars (not tests)
├─ docs/
│  ├─ architecture.md           # one-page mental model
│  ├─ AUDIT.md                  # snapshot audit (gaps, fixes, follow-ups)
│  └─ todo.md                   # post-fix backlog
├─ .github/workflows/npm_release.yml   # CI publishes on GitHub release
├─ AGENTS.md                    # this file
├─ CLAUDE.md                    # pointer to this file
└─ README.md                    # user-facing API docs
```

---

## 3. Architecture (TL;DR)

`QrynClient` composes three sub-clients (`Loki`, `Prometheus`, `Tempo`), each holding a reference to a single shared `Http` service. All HTTP traffic flows through `Http.request()`, which handles base URL resolution, basic auth, timeout (`AbortSignal.timeout`), and error normalization (everything throws `QrynError`).

`Stream` and `Metric` are buffer-and-flush models. The `Collector` adds bulk batching: it deduplicates Streams/Metrics by a generated `key`, keeps them in an `LRUCache`, and flushes when total entries+samples cross `maxBulkSize` or `maxTimeout` elapses.

For the deeper view (data flow, lifecycle invariants, batching state machine), see [`docs/architecture.md`](docs/architecture.md).

---

## 4. Public API surface

Exported from `src/index.js`:

| Symbol | Purpose |
|---|---|
| `QrynClient` | Entry point. `new QrynClient({ baseUrl, auth, timeout, headers })` |
| `Stream` | Log stream model. Usually obtained via `client.createStream(labels)`. |
| `Metric` | Metric model. Usually obtained via `client.createMetric({ name, labels })`. |
| `Collector` | Batching wrapper. Usually obtained via `client.createCollector(opts)`. |

Both direct instantiation (`new Stream(...)`) and factory methods (`client.createStream(...)`) are supported. **Prefer the factory methods**; they're the documented entry path and are easier to wire to a `Collector` later.

---

## 5. Lifecycle invariants (CRITICAL — read before adding clients)

`Stream` and `Metric` implement an optimistic push pattern. Any client that consumes them MUST honor the contract:

```
addEntry/addSample  ──▶  buffers in `entries` / `samples`
        │
        ▼
collect()           ──▶  snapshots buffer, returns serialized payload, CLEARS buffer
        │
        ├── (server 2xx) ──▶ confirm()  — discards the snapshot
        └── (error)      ──▶ undo()     — restores snapshot to head of buffer for retry
```

**If you add a new client that pushes Streams or Metrics, you must call `confirm()` on success and `undo()` on failure.** Skipping `undo()` silently drops data. Skipping `confirm()` causes data to be retried indefinitely on the next push.

The existing Loki and Prometheus clients are the reference implementations. Mirror their try/catch shape exactly.

---

## 6. Build / run / test

```bash
npm install              # installs deps; no build step
node example/index.js    # smoke push (needs QYRN_WRITE_URL, QYRN_LOGIN, QRYN_PASSWORD env vars)
node example/collector.js
node example/read.js     # needs QYRN_READ_URL, QYRN_ORG_ID
```

**There is no test suite yet.** This is tracked in [`docs/todo.md`](docs/todo.md). Until one exists, validate changes by:

1. Requiring the entry and instantiating: `node -e "require('./src')"`.
2. Running the relevant `example/*.js` against a live qryn (or a local qryn container).

---

## 7. Code style

- **Module system:** CommonJS only (`require` / `module.exports`). Do not introduce ESM.
- **Language:** Plain JavaScript. No TypeScript. Public methods are JSDoc-typed; honor that pattern when adding methods.
- **Privacy:** Use `#privateField` for genuinely private state (see `Stream`, `Metric`, `Http`). Do not introduce `_underscorePrefix` conventions.
- **Errors:** Always throw `QrynError` (or a subclass) at module boundaries. Never `console.error` and swallow.
- **No linter / formatter is configured.** Don't auto-format files you didn't touch. Match surrounding indentation (2 spaces) and quote style (single quotes).
- **Dependencies:** Resist adding them. Current set: `lru-cache`, `protobufjs`, `snappy`. Anything else needs justification.

---

## 8. Commit & PR conventions

Inferred from `git log`:

- Subjects are short, lowercase, imperative-ish, **not** Conventional Commits. Examples: `tempo client added to request the traces using search method`, `error handling`, `Updated collector and error handling`.
- PRs from forks are squash-merged with a `Merge pull request #N from user/branch` commit.
- No CHANGELOG file is maintained; release notes live on GitHub Releases.

Match this style. If you want to introduce Conventional Commits, that's a project-wide decision — open an issue first.

---

## 9. Release process

Releases are CI-driven via [`.github/workflows/npm_release.yml`](.github/workflows/npm_release.yml):

1. Bump `version` in `package.json` and merge to `main`.
2. Create a GitHub Release pointing at the new tag.
3. The workflow runs `npm publish --access public` using `secrets.NPM_TOKEN`.

**Do not manually `npm publish` from a local machine.** Do not edit `.github/workflows/*` without explicit instruction.

---

## 10. Known pitfalls — DO NOT "fix" blindly

These look like bugs at first glance. Some have already been fixed in the audit pass; others are subtle invariants. Read [`docs/AUDIT.md`](docs/AUDIT.md) before changing any of these lines.

- **`Http.request()` content-type handling.** The body is parsed based on the **response** content-type (after the audit fix), not the request content-type. Re-introducing a request-content-type gate will silently empty most response bodies.
- **`fpLimit` / `ttlDays` headers.** These map to `X-FP-Limit` and `X-Ttl-Days` respectively (after the audit fix). Earlier versions had them swapped — consumers may have been relying on the swap. Don't re-swap them.
- **`Stream.collect()` clears the buffer.** This is intentional for the confirm/undo pattern. Do not "fix" it to leave entries in place.
- **`Loki.push` validator pushes inside the `every()` callback.** The pattern is intentional (single-pass collect + validate). It's ugly but correct after re-reading. If you refactor it, preserve the "skip empty streams, accept non-Stream as failure" behavior.
- **`Tempo.search()` now throws `QrynError` (after audit fix).** Earlier versions logged and returned `undefined`; the documented `.catch()` failover pattern relies on the throw.

---

## 11. Agent boundaries

Files an autonomous agent should **not** modify without explicit user instruction:

| Path | Why |
|---|---|
| `src/services/remote.proto` | Vendored upstream Prometheus remote-write schema. Update only when upstream changes. |
| `.github/workflows/*` | Release infrastructure. Mistakes affect npm publish. |
| `package.json` `version` field | Owned by the release process; bump only in a dedicated release commit. |
| `package-lock.json` | Not tracked in this repo (intentionally — see `.gitignore`). Don't add it. |
| `example/*` | Smoke scripts wired to env vars. Add new examples; don't restructure existing ones. |

Files agents are free to edit:

- Anything under `src/` (subject to `Section 5` lifecycle rules and the `Section 10` pitfalls).
- `README.md`, `AGENTS.md`, `CLAUDE.md`, anything under `docs/`.
- `package.json` `dependencies` / `description` / `keywords` (not `version`).

---

## 12. Recipe — adding a new client

To add a new sub-client (e.g., a future Pyroscope/profiles client):

1. **Create the file:** `src/clients/<name>.js`. Class takes `service` (Http) in the constructor.
2. **Mirror the error pattern:** wrap each request in `.catch()` that re-throws `QrynError` with a contextual message and `error.statusCode`. Look at `src/clients/loki.js` for the canonical shape.
3. **Honor `orgId`:** add a `headers(options)` method that conditionally sets `X-Scope-OrgID`. Match Loki/Prometheus.
4. **Wire into `QrynClient`:** require it in `src/index.js` and add `this.<name> = new <Name>Client(http)` in the constructor.
5. **JSDoc every public method.** No exceptions — this library has no `.d.ts`, so JSDoc is the contract.
6. **Document in `README.md`:** add a `### <Name>` section under "Usage" with a working example, and an entry in the API Reference.
7. **Add a smoke example:** `example/<name>.js` driven by env vars.

---

## 13. References

- [`README.md`](README.md) — user-facing API docs.
- [`docs/architecture.md`](docs/architecture.md) — data-flow + lifecycle deep-dive.
- [`docs/AUDIT.md`](docs/AUDIT.md) — snapshot audit (what was found, what got fixed, what's left).
- [`docs/todo.md`](docs/todo.md) — post-fix backlog.
- [qryn project](https://qryn.dev) — backend this client targets.
