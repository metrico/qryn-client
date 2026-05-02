# qryn-client v1.1.0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land P0 + P1 of the qryn-client extensions requirements as a non-breaking v1.1.0 minor release: per-call abort/timeout/retry on every HTTP call, pluggable auth (basic/bearer/custom), a new `LokiReader`, alignment of `TempoClient` to the spec surface, and shipped `.d.ts` types.

**Architecture:** All five additions hang off one shared HTTP layer. The first wave of tasks rebuilds [src/services/http.js](../../../src/services/http.js) into a per-call options pipeline (signal, timeoutMs, retry, orgId, async auth resolver). Once that exists, `LokiReader`, `PromReader` opts plumbing, and `TempoClient` additions are all thin layers on top. Type emission happens last — generate `dist/types/` from JSDoc via `tsc --declaration --allowJs`, then hand-augment with [index.d.ts](../../../index.d.ts) for the named response types and `QrynResponse<T>` generics that JSDoc cannot express.

**Tech Stack:** Node ≥ 18, native `fetch`, `AbortSignal.timeout`, `AbortSignal.any` (with a Node-18 polyfill), `node:test` (built-in test runner), `typescript` (devDep, declaration-only), CommonJS source.

**Source spec:** [docs/superpowers/specs/2026-05-02-qryn-client-v1.1-design.md](../specs/2026-05-02-qryn-client-v1.1-design.md)

---

## File map

| File | Status | Responsibility |
|---|---|---|
| [src/services/http.js](../../../src/services/http.js) | Modify | Per-call options pipeline. Resolves auth, builds combined signal, runs the retry loop, maps abort/timeout to typed errors. |
| [src/utils/abort.js](../../../src/utils/abort.js) | Create | `anySignal(signals[])` — wraps `AbortSignal.any` when present, falls back to a controller + listeners on Node 18. Pure utility. |
| [src/utils/time.js](../../../src/utils/time.js) | Create | `toNanos(input)` — normalizes `Date \| number \| string` to a nanosecond integer string. Pure utility. |
| [src/utils/retry.js](../../../src/utils/retry.js) | Create | `computeBackoff(attempt, opts)`, `parseRetryAfter(header)`, `isRetryableStatus(n)`, `isRetryableNetworkError(err)`. Pure helpers, easy to unit-test. |
| [src/types/qrynAbortedError.js](../../../src/types/qrynAbortedError.js) | Create | `class QrynAbortedError extends QrynError`. |
| [src/types/qrynTimeoutError.js](../../../src/types/qrynTimeoutError.js) | Create | `class QrynTimeoutError extends QrynError`. |
| [src/types/index.js](../../../src/types/index.js) | Modify | Re-export the two new error classes. |
| [src/index.js](../../../src/index.js) | Modify | Constructor accepts `auth` (discriminated union), `retry`, `defaultOrgId`. Runs the legacy-auth `process.emitWarning` shim. Exposes new errors. |
| [src/clients/loki.js](../../../src/clients/loki.js) | Modify | Add `createReader(options)` factory. `push` plumbs through new opts. |
| [src/clients/loki-read.js](../../../src/clients/loki-read.js) | Create | `LokiReader` — `query`, `queryRange`, `labels`, `labelValues`, `series`. |
| [src/clients/prometheus.js](../../../src/clients/prometheus.js) | Modify | `Read` methods grow optional `opts` trailing arg. `push` plumbs through. |
| [src/clients/tempo.js](../../../src/clients/tempo.js) | Modify | New methods `searchTags`, `searchTagValues`, `getTrace` (alias). Existing methods grow `opts`. |
| [tests/unit/abort.test.js](../../../tests/unit/abort.test.js) | Create | Unit test for `anySignal`. |
| [tests/unit/time.test.js](../../../tests/unit/time.test.js) | Create | Unit test for `toNanos`. |
| [tests/unit/retry.test.js](../../../tests/unit/retry.test.js) | Create | Unit test for retry helpers. |
| [tests/unit/auth.test.js](../../../tests/unit/auth.test.js) | Create | Unit test for legacy-auth shim + auth resolution. |
| [tests/unit/http.test.js](../../../tests/unit/http.test.js) | Create | Unit test for `Http.request` opts pipeline (mocked `fetch`). |
| [tests/unit/loki-read.test.js](../../../tests/unit/loki-read.test.js) | Create | Unit test for `LokiReader` URL building (mocked `fetch`). |
| [tests/unit/tempo.test.js](../../../tests/unit/tempo.test.js) | Create | Unit test for new tempo methods (mocked `fetch`). |
| [tests/types/consumer-smoke.ts](../../../tests/types/consumer-smoke.ts) | Create | Strict TS consumer that imports the public surface. |
| [tsconfig.json](../../../tsconfig.json) | Create | Bare-minimum config for `tsc --declaration` and the consumer smoke. |
| [index.d.ts](../../../index.d.ts) | Create | Hand-written augmentation: re-exports JSDoc-derived `dist/types/index.d.ts`, plus `QrynAuth`, `RetryOptions`, `ReadOpts`, `QrynResponse<T>`, named response types. |
| [example/loki-read.js](../../../example/loki-read.js) | Create | Manual smoke for the new Loki reader. |
| [example/tempo.js](../../../example/tempo.js) | Create | Manual smoke for new tempo surface. |
| [package.json](../../../package.json) | Modify | `types`, `files`, `scripts` (`test`, `build:types`, `test:types`), devDep on `typescript`. Version bump 1.0.10 → 1.1.0 (LAST step before release). |
| [README.md](../../../README.md) | Modify | Document new auth shape, `client.loki.createReader()`, tempo additions, retry/abort, the deprecation. Add a "Migration to 1.1.0" section. |
| [docs/architecture.md](../../../docs/architecture.md) | Modify | Update the HTTP/auth section. |

`docs/AUDIT.md`, `docs/todo.md`, `.github/workflows/npm_release.yml` are not modified by this plan unless explicitly noted in a task.

## Verification notes for the executing engineer

- This repo has no test runner today (`npm test` exits 1). Task 1 sets up `node:test` minimally. Do **not** add Jest, Mocha, vitest, or any other test framework.
- Default file format: CommonJS (`require` / `module.exports`). Do NOT introduce ESM. Use `require` everywhere in `src/`.
- Indentation is 2 spaces, single quotes. Match the surrounding style. Do not run a formatter.
- Errors thrown at module boundaries must be `QrynError` (or a subclass). Never `console.error` and swallow.
- `Stream` and `Metric` lifecycle (collect → confirm/undo) is sacred — see [AGENTS.md §5](../../../AGENTS.md). None of these tasks touch that path, but if you find yourself editing `Loki.push` or `Prometheus.push` beyond plumbing options into `service.request(...)`, you've drifted off-plan.
- Some pitfalls to avoid in `Http.request` are documented in [AGENTS.md §10](../../../AGENTS.md). Re-read that section before Task 6.
- Commits use the existing project style: short, lowercase, imperative. Examples in `git log`. **Do NOT use Conventional Commits prefixes** (`feat:`, `fix:`) — the project does not use them.
- Each task ends with a commit. Frequent commits are mandatory.

---

## Task 1: Set up minimal test runner

**Files:**
- Modify: [package.json](../../../package.json) — `scripts.test`
- Create: [tests/unit/.gitkeep](../../../tests/unit/.gitkeep)
- Create: [tests/unit/sanity.test.js](../../../tests/unit/sanity.test.js)

- [ ] **Step 1: Wire `node:test` as the test runner**

Edit [package.json](../../../package.json). Replace the `test` script:

```json
"scripts": {
  "test": "node --test tests/unit/"
}
```

- [ ] **Step 2: Create a sanity test that proves the runner works**

Create [tests/unit/sanity.test.js](../../../tests/unit/sanity.test.js):

```js
const { test } = require('node:test');
const assert = require('node:assert/strict');

test('runner is alive', () => {
  assert.equal(1 + 1, 2);
});
```

- [ ] **Step 3: Run the sanity test**

Run: `npm test`
Expected: `# pass 1` and exit 0.

- [ ] **Step 4: Commit**

```bash
git add package.json tests/unit/sanity.test.js
git commit -m "wire node:test as the test runner"
```

---

## Task 2: `anySignal` — combine AbortSignals (Node-18 compatible)

**Files:**
- Create: [src/utils/abort.js](../../../src/utils/abort.js)
- Create: [tests/unit/abort.test.js](../../../tests/unit/abort.test.js)

- [ ] **Step 1: Write the failing test**

Create [tests/unit/abort.test.js](../../../tests/unit/abort.test.js):

```js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { anySignal } = require('../../src/utils/abort');

test('returns a signal already aborted when an input is already aborted', () => {
  const a = new AbortController();
  a.abort('first');
  const signal = anySignal([a.signal, new AbortController().signal]);
  assert.equal(signal.aborted, true);
});

test('aborts when the first input aborts', () => {
  const a = new AbortController();
  const b = new AbortController();
  const signal = anySignal([a.signal, b.signal]);
  assert.equal(signal.aborted, false);
  a.abort('boom');
  assert.equal(signal.aborted, true);
});

test('aborts when the second input aborts', () => {
  const a = new AbortController();
  const b = new AbortController();
  const signal = anySignal([a.signal, b.signal]);
  b.abort('boom2');
  assert.equal(signal.aborted, true);
});

test('passes the original reason through', () => {
  const a = new AbortController();
  const reason = new Error('caller abort');
  const signal = anySignal([a.signal]);
  a.abort(reason);
  assert.equal(signal.reason, reason);
});

test('drops null/undefined signals', () => {
  const a = new AbortController();
  const signal = anySignal([null, undefined, a.signal]);
  assert.equal(signal.aborted, false);
  a.abort();
  assert.equal(signal.aborted, true);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '../../src/utils/abort'`.

- [ ] **Step 3: Implement `anySignal`**

Create [src/utils/abort.js](../../../src/utils/abort.js):

```js
'use strict';

/**
 * Returns an AbortSignal that aborts when ANY of the input signals abort.
 * Wraps `AbortSignal.any` when available (Node 20+); otherwise registers
 * one-shot listeners on each input signal.
 *
 * Null/undefined inputs are silently dropped.
 *
 * @param {Array<AbortSignal|null|undefined>} signals
 * @returns {AbortSignal}
 */
function anySignal(signals) {
  const inputs = signals.filter(s => s != null);

  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.any === 'function') {
    return AbortSignal.any(inputs);
  }

  const controller = new AbortController();

  // Already aborted? Forward immediately.
  for (const s of inputs) {
    if (s.aborted) {
      controller.abort(s.reason);
      return controller.signal;
    }
  }

  const onAbort = (event) => {
    const source = event.target;
    controller.abort(source.reason);
    for (const s of inputs) {
      s.removeEventListener('abort', onAbort);
    }
  };

  for (const s of inputs) {
    s.addEventListener('abort', onAbort, { once: true });
  }

  return controller.signal;
}

module.exports = { anySignal };
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test`
Expected: all `abort.test.js` tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/utils/abort.js tests/unit/abort.test.js
git commit -m "add anySignal util for combining AbortSignals (Node 18 compatible)"
```

---

## Task 3: `toNanos` — time normalization for Loki

**Files:**
- Create: [src/utils/time.js](../../../src/utils/time.js)
- Create: [tests/unit/time.test.js](../../../tests/unit/time.test.js)

- [ ] **Step 1: Write the failing test**

Create [tests/unit/time.test.js](../../../tests/unit/time.test.js):

```js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { toNanos } = require('../../src/utils/time');

test('Date → nanoseconds string', () => {
  const d = new Date(1700000000000); // 2023-11-14T22:13:20Z
  assert.equal(toNanos(d), '1700000000000000000');
});

test('seconds heuristic (number < 1e12) → nanoseconds', () => {
  assert.equal(toNanos(1700000000), '1700000000000000000');
});

test('milliseconds heuristic (1e12 <= number < 1e15) → nanoseconds', () => {
  assert.equal(toNanos(1700000000000), '1700000000000000000');
});

test('nanoseconds heuristic (number >= 1e15) → unchanged (string form)', () => {
  assert.equal(toNanos(1700000000000000000), '1700000000000000000');
});

test('string passes through unchanged', () => {
  assert.equal(toNanos('1700000000000000123'), '1700000000000000123');
});

test('throws on null/undefined', () => {
  assert.throws(() => toNanos(null));
  assert.throws(() => toNanos(undefined));
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `toNanos`**

Create [src/utils/time.js](../../../src/utils/time.js):

```js
'use strict';

const { QrynError } = require('../types');

/**
 * Normalize a time input to a nanosecond integer string.
 * - Date          → milliseconds × 1e6
 * - number < 1e12 → assumed seconds, multiplied to ns
 * - number < 1e15 → assumed milliseconds, multiplied to ns
 * - number ≥ 1e15 → assumed nanoseconds (kept)
 * - string        → returned unchanged (caller knows the unit)
 *
 * Returned as a string to preserve precision beyond Number.MAX_SAFE_INTEGER.
 *
 * @param {Date|number|string} input
 * @returns {string}
 */
function toNanos(input) {
  if (input == null) {
    throw new QrynError('toNanos: input is required');
  }
  if (input instanceof Date) {
    return (BigInt(input.getTime()) * 1000000n).toString();
  }
  if (typeof input === 'string') {
    return input;
  }
  if (typeof input === 'number' && Number.isFinite(input)) {
    if (input < 1e12) {
      return (BigInt(Math.trunc(input)) * 1000000000n).toString();
    }
    if (input < 1e15) {
      return (BigInt(Math.trunc(input)) * 1000000n).toString();
    }
    return BigInt(Math.trunc(input)).toString();
  }
  throw new QrynError(`toNanos: unsupported input type ${typeof input}`);
}

module.exports = { toNanos };
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test`
Expected: all `time.test.js` tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/utils/time.js tests/unit/time.test.js
git commit -m "add toNanos time normalization helper for Loki reader"
```

---

## Task 4: Retry helpers — pure functions for the policy math

**Files:**
- Create: [src/utils/retry.js](../../../src/utils/retry.js)
- Create: [tests/unit/retry.test.js](../../../tests/unit/retry.test.js)

- [ ] **Step 1: Write the failing test**

Create [tests/unit/retry.test.js](../../../tests/unit/retry.test.js):

```js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  DEFAULT_RETRY,
  computeBackoff,
  parseRetryAfter,
  isRetryableStatus,
  isRetryableNetworkError
} = require('../../src/utils/retry');

test('DEFAULT_RETRY matches spec defaults', () => {
  assert.equal(DEFAULT_RETRY.attempts, 3);
  assert.equal(DEFAULT_RETRY.baseDelayMs, 200);
  assert.equal(DEFAULT_RETRY.maxDelayMs, 5000);
});

test('computeBackoff: exponential growth, capped at maxDelayMs', (t) => {
  // Force jitter to identity for assertable math.
  const random = () => 1.0;
  assert.equal(computeBackoff(1, { baseDelayMs: 200, maxDelayMs: 5000 }, random), 200);
  assert.equal(computeBackoff(2, { baseDelayMs: 200, maxDelayMs: 5000 }, random), 400);
  assert.equal(computeBackoff(3, { baseDelayMs: 200, maxDelayMs: 5000 }, random), 800);
  assert.equal(computeBackoff(10, { baseDelayMs: 200, maxDelayMs: 5000 }, random), 5000);
});

test('computeBackoff: jitter scales the delay by [0,1)', () => {
  const fixed = computeBackoff(2, { baseDelayMs: 200, maxDelayMs: 5000 }, () => 0.5);
  assert.equal(fixed, 200);
});

test('parseRetryAfter: numeric seconds', () => {
  assert.equal(parseRetryAfter('5'), 5000);
  assert.equal(parseRetryAfter('0'), 0);
});

test('parseRetryAfter: HTTP-date', () => {
  const future = new Date(Date.now() + 3000);
  const ms = parseRetryAfter(future.toUTCString());
  assert.ok(ms >= 2000 && ms <= 4000);
});

test('parseRetryAfter: invalid → null', () => {
  assert.equal(parseRetryAfter('garbage'), null);
  assert.equal(parseRetryAfter(undefined), null);
  assert.equal(parseRetryAfter(null), null);
});

test('isRetryableStatus: only 408, 429, 502, 503, 504', () => {
  for (const s of [408, 429, 502, 503, 504]) {
    assert.equal(isRetryableStatus(s), true, `${s} should be retryable`);
  }
  for (const s of [200, 400, 401, 403, 404, 422, 500, 501]) {
    assert.equal(isRetryableStatus(s), false, `${s} must not be retryable`);
  }
});

test('isRetryableNetworkError: known codes', () => {
  for (const code of ['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'EAI_AGAIN']) {
    assert.equal(isRetryableNetworkError({ code }), true);
    assert.equal(isRetryableNetworkError({ cause: { code } }), true);
  }
  assert.equal(isRetryableNetworkError({ code: 'EPERM' }), false);
  assert.equal(isRetryableNetworkError(null), false);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the helpers**

Create [src/utils/retry.js](../../../src/utils/retry.js):

```js
'use strict';

const DEFAULT_RETRY = Object.freeze({
  attempts: 3,
  baseDelayMs: 200,
  maxDelayMs: 5000
});

const RETRYABLE_STATUS = new Set([408, 429, 502, 503, 504]);
const RETRYABLE_NET_CODES = new Set(['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'EAI_AGAIN']);

/**
 * Exponential backoff with full jitter.
 * delay = jitter * min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1))
 *
 * @param {number} attempt - 1-based attempt number that just failed.
 * @param {{ baseDelayMs: number, maxDelayMs: number }} opts
 * @param {() => number} [random=Math.random] - Injected for testing.
 * @returns {number} delay in milliseconds before the next attempt.
 */
function computeBackoff(attempt, opts, random = Math.random) {
  const exp = opts.baseDelayMs * Math.pow(2, attempt - 1);
  const capped = Math.min(opts.maxDelayMs, exp);
  return Math.floor(random() * capped);
}

/**
 * Parse a Retry-After header (RFC 7231).
 * @param {string|null|undefined} value
 * @returns {number|null} milliseconds to wait, or null if unparseable.
 */
function parseRetryAfter(value) {
  if (value == null) return null;
  const trimmed = String(value).trim();
  if (trimmed === '') return null;
  if (/^\d+$/.test(trimmed)) {
    return Number(trimmed) * 1000;
  }
  const ts = Date.parse(trimmed);
  if (Number.isNaN(ts)) return null;
  return Math.max(0, ts - Date.now());
}

/**
 * @param {number} status
 * @returns {boolean}
 */
function isRetryableStatus(status) {
  return RETRYABLE_STATUS.has(status);
}

/**
 * @param {{code?: string, cause?: {code?: string}} | null | undefined} err
 * @returns {boolean}
 */
function isRetryableNetworkError(err) {
  if (!err) return false;
  if (err.code && RETRYABLE_NET_CODES.has(err.code)) return true;
  if (err.cause && err.cause.code && RETRYABLE_NET_CODES.has(err.cause.code)) return true;
  return false;
}

module.exports = {
  DEFAULT_RETRY,
  computeBackoff,
  parseRetryAfter,
  isRetryableStatus,
  isRetryableNetworkError
};
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test`
Expected: all `retry.test.js` tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/utils/retry.js tests/unit/retry.test.js
git commit -m "add retry helpers (backoff, retry-after, retryable-status)"
```

---

## Task 5: New error classes — `QrynAbortedError`, `QrynTimeoutError`

**Files:**
- Create: [src/types/qrynAbortedError.js](../../../src/types/qrynAbortedError.js)
- Create: [src/types/qrynTimeoutError.js](../../../src/types/qrynTimeoutError.js)
- Modify: [src/types/index.js](../../../src/types/index.js)

- [ ] **Step 1: Create `QrynAbortedError`**

Create [src/types/qrynAbortedError.js](../../../src/types/qrynAbortedError.js):

```js
const QrynError = require('./qrynError');

/**
 * Thrown when a request is aborted by a caller-supplied AbortSignal.
 * Distinct from QrynTimeoutError (which signals the request's own timeout fired)
 * and from network errors.
 */
class QrynAbortedError extends QrynError {
  /**
   * @param {string} message
   * @param {*} [reason] - The AbortSignal.reason at abort time, if any.
   * @param {string} [path]
   */
  constructor(message, reason, path) {
    super(message, null, reason, path);
    this.name = 'QrynAbortedError';
    this.reason = reason;
  }
}

module.exports = QrynAbortedError;
```

- [ ] **Step 2: Create `QrynTimeoutError`**

Create [src/types/qrynTimeoutError.js](../../../src/types/qrynTimeoutError.js):

```js
const QrynError = require('./qrynError');

/**
 * Thrown when the per-request timeout (timeoutMs) elapses before the
 * fetch resolves. Distinct from QrynAbortedError (caller-driven) and
 * from network errors.
 */
class QrynTimeoutError extends QrynError {
  /**
   * @param {string} message
   * @param {number} elapsedMs
   * @param {string} [path]
   */
  constructor(message, elapsedMs, path) {
    super(message, null, undefined, path);
    this.name = 'QrynTimeoutError';
    this.elapsedMs = elapsedMs;
  }
}

module.exports = QrynTimeoutError;
```

- [ ] **Step 3: Re-export from types/index.js**

Edit [src/types/index.js](../../../src/types/index.js). The new file content:

```js
const QrynError = require('./qrynError');
const QrynResponse = require('./qrynResponse');
const QrynAbortedError = require('./qrynAbortedError');
const QrynTimeoutError = require('./qrynTimeoutError');

class NetworkError extends QrynError {
  constructor(message, options = {}) {
    super(message, options);
    this.name = 'NetworkError';
    this.statusCode = options.statusCode;
  }
}

class ValidationError extends QrynError {
  constructor(message, options = {}) {
    super(message, options);
    this.name = 'ValidationError';
    this.field = options.field;
  }
}

module.exports = {
  NetworkError,
  ValidationError,
  QrynError,
  QrynAbortedError,
  QrynTimeoutError,
  QrynResponse
};
```

- [ ] **Step 4: Smoke-check the require graph**

Run: `node -e "const t = require('./src/types'); console.log(Object.keys(t));"`
Expected: prints `[ 'NetworkError', 'ValidationError', 'QrynError', 'QrynAbortedError', 'QrynTimeoutError', 'QrynResponse' ]`.

- [ ] **Step 5: Run all tests to confirm no regression**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/types/qrynAbortedError.js src/types/qrynTimeoutError.js src/types/index.js
git commit -m "add QrynAbortedError and QrynTimeoutError"
```

---

## Task 6: Auth resolver + legacy-auth back-compat shim

This task introduces the auth pipeline that `Http` will use. The work is split: a small pure resolver helper goes into a new module so it's testable without `fetch`, and the QrynClient constructor gets the shim. `Http` is *not* yet wired to the resolver — that comes in Task 7.

**Files:**
- Create: [src/services/auth.js](../../../src/services/auth.js)
- Create: [tests/unit/auth.test.js](../../../tests/unit/auth.test.js)
- Modify: [src/index.js](../../../src/index.js)

- [ ] **Step 1: Write the failing test**

Create [tests/unit/auth.test.js](../../../tests/unit/auth.test.js):

```js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { resolveAuthHeaders, normalizeAuth } = require('../../src/services/auth');

test('basic: builds Authorization header', async () => {
  const headers = await resolveAuthHeaders({ type: 'basic', username: 'u', password: 'p' });
  const expected = 'Basic ' + Buffer.from('u:p').toString('base64');
  assert.equal(headers.Authorization, expected);
});

test('bearer: string token', async () => {
  const headers = await resolveAuthHeaders({ type: 'bearer', token: 'abc' });
  assert.equal(headers.Authorization, 'Bearer abc');
});

test('bearer: thunk is awaited each call', async () => {
  let n = 0;
  const tokenFn = async () => `token-${++n}`;
  const a = await resolveAuthHeaders({ type: 'bearer', token: tokenFn });
  const b = await resolveAuthHeaders({ type: 'bearer', token: tokenFn });
  assert.equal(a.Authorization, 'Bearer token-1');
  assert.equal(b.Authorization, 'Bearer token-2');
});

test('custom: object headers', async () => {
  const headers = await resolveAuthHeaders({
    type: 'custom',
    headers: { 'X-Api-Key': 'abc' }
  });
  assert.deepEqual(headers, { 'X-Api-Key': 'abc' });
});

test('custom: thunk headers', async () => {
  const headers = await resolveAuthHeaders({
    type: 'custom',
    headers: async () => ({ 'X-Api-Key': 'fresh' })
  });
  assert.deepEqual(headers, { 'X-Api-Key': 'fresh' });
});

test('undefined auth → empty headers', async () => {
  const headers = await resolveAuthHeaders(undefined);
  assert.deepEqual(headers, {});
});

test('normalizeAuth: legacy {username,password} coerced to basic', () => {
  const result = normalizeAuth({ username: 'u', password: 'p' });
  assert.equal(result.legacy, true);
  assert.deepEqual(result.auth, { type: 'basic', username: 'u', password: 'p' });
});

test('normalizeAuth: typed auth passes through', () => {
  const a = { type: 'bearer', token: 't' };
  const result = normalizeAuth(a);
  assert.equal(result.legacy, false);
  assert.equal(result.auth, a);
});

test('normalizeAuth: undefined passes through', () => {
  const result = normalizeAuth(undefined);
  assert.equal(result.legacy, false);
  assert.equal(result.auth, undefined);
});

test('normalizeAuth: unknown type rejected', () => {
  assert.throws(() => normalizeAuth({ type: 'banana' }));
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the auth module**

Create [src/services/auth.js](../../../src/services/auth.js):

```js
'use strict';

const { QrynError } = require('../types');

/**
 * @typedef {Object} BasicAuth
 * @property {'basic'} type
 * @property {string} username
 * @property {string} password
 *
 * @typedef {Object} BearerAuth
 * @property {'bearer'} type
 * @property {string|(() => Promise<string>)} token
 *
 * @typedef {Object} CustomAuth
 * @property {'custom'} type
 * @property {Record<string,string>|(() => Promise<Record<string,string>>)} headers
 *
 * @typedef {BasicAuth|BearerAuth|CustomAuth} QrynAuth
 */

/**
 * Resolve the auth `QrynAuth` config to a header map for the next request.
 * Bearer/custom thunks are awaited each call so the caller can refresh.
 *
 * @param {QrynAuth|undefined} auth
 * @returns {Promise<Record<string,string>>}
 */
async function resolveAuthHeaders(auth) {
  if (!auth) return {};
  switch (auth.type) {
    case 'basic': {
      const encoded = Buffer.from(`${auth.username}:${auth.password}`).toString('base64');
      return { Authorization: `Basic ${encoded}` };
    }
    case 'bearer': {
      const token = typeof auth.token === 'function' ? await auth.token() : auth.token;
      return { Authorization: `Bearer ${token}` };
    }
    case 'custom': {
      const h = typeof auth.headers === 'function' ? await auth.headers() : auth.headers;
      return { ...h };
    }
    default:
      throw new QrynError(`Unsupported auth type: ${auth.type}`);
  }
}

/**
 * Normalize a constructor-time `auth` value: detect the legacy
 * `{ username, password }` shape and coerce to `{ type: 'basic', ... }`.
 *
 * @param {QrynAuth|{username:string,password:string}|undefined} auth
 * @returns {{ auth: QrynAuth|undefined, legacy: boolean }}
 */
function normalizeAuth(auth) {
  if (!auth) return { auth: undefined, legacy: false };
  if (!auth.type && auth.username !== undefined) {
    return {
      auth: { type: 'basic', username: auth.username, password: auth.password },
      legacy: true
    };
  }
  if (!['basic', 'bearer', 'custom'].includes(auth.type)) {
    throw new QrynError(`Unsupported auth type: ${auth.type}`);
  }
  return { auth, legacy: false };
}

module.exports = { resolveAuthHeaders, normalizeAuth };
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test`
Expected: all `auth.test.js` tests pass.

- [ ] **Step 5: Wire the legacy-auth shim into the QrynClient constructor**

Edit [src/index.js](../../../src/index.js). Replace the constructor body. Full new file content:

```js
const {Stream, Metric} = require('./models');
const PrometheusClient = require('./clients/prometheus');
const Collector = require('./utils/collector');
const LokiClient = require('./clients/loki');
const TempoClient = require('./clients/tempo');
const Http = require('./services/http');
const {
  QrynError,
  QrynAbortedError,
  QrynTimeoutError
} = require('./types');
const { normalizeAuth } = require('./services/auth');

let __legacyAuthWarned = false;

/**
 * Main client for qryn operations.
 */
class QrynClient {
  /**
   * @param {Object} config
   * @param {string} [config.baseUrl='http://localhost:3100']
   * @param {import('./services/auth').QrynAuth | {username:string,password:string}} [config.auth]
   * @param {number} [config.timeout=60000]
   * @param {Object} [config.headers={}]
   * @param {import('./utils/retry').RetryOptions} [config.retry]
   * @param {string} [config.defaultOrgId]
   */
  constructor(config) {
    if (typeof config !== 'object' || config === null) {
      throw new QrynError('Config must be a non-null object');
    }

    const { auth, legacy } = normalizeAuth(config.auth);
    if (legacy && !__legacyAuthWarned) {
      __legacyAuthWarned = true;
      process.emitWarning(
        "qryn-client: auth: { username, password } is deprecated; use auth: { type: 'basic', username, password }. The legacy shape will be removed in 2.0.0.",
        'DeprecationWarning',
        'QRYN_AUTH_LEGACY'
      );
    }

    const baseUrl = config.baseUrl || 'http://localhost:3100';
    const timeout = config.timeout || 60000;
    const headers = {
      'Content-Type': 'application/json',
      ...config.headers
    };

    const http = new Http(baseUrl, timeout, headers, auth, {
      retry: config.retry,
      defaultOrgId: config.defaultOrgId
    });

    this.prom = new PrometheusClient(http);
    this.loki = new LokiClient(http);
    this.tempo = new TempoClient(http);
  }

  createCollector(config) { return new Collector(this, config); }
  createStream(labels)    { return new Stream(labels); }
  createMetric({ name, labels = {} }) { return new Metric(name, labels); }
}

module.exports = {
  QrynClient,
  Stream,
  Metric,
  Collector,
  QrynError,
  QrynAbortedError,
  QrynTimeoutError
};
```

Note: the existing `Auth` class declared in this file was unused (private to the file, never instantiated). Removed.

- [ ] **Step 6: Smoke-check the constructor**

Run:

```
node -e "const {QrynClient} = require('./src'); new QrynClient({baseUrl:'http://x'}); console.log('ok')"
```

Expected: `ok`.

Run:

```
node -e "const {QrynClient} = require('./src'); process.on('warning',w=>console.log('WARN:',w.code,w.message)); new QrynClient({baseUrl:'http://x', auth:{username:'u',password:'p'}}); setTimeout(()=>{},10);"
```

Expected: prints a line beginning `WARN: QRYN_AUTH_LEGACY ...`.

- [ ] **Step 7: Run all tests to confirm no regression**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 8: Commit**

```bash
git add src/services/auth.js tests/unit/auth.test.js src/index.js
git commit -m "add discriminated-union auth resolver and legacy-auth deprecation shim"
```

---

## Task 7: HTTP per-call options + signal/timeout error mapping

This is the largest task. `Http.request` becomes the per-call options pipeline. No retry yet — that's Task 8 — so the structure stays simple.

**Files:**
- Modify: [src/services/http.js](../../../src/services/http.js)
- Create: [tests/unit/http.test.js](../../../tests/unit/http.test.js)

- [ ] **Step 1: Write the failing test**

Create [tests/unit/http.test.js](../../../tests/unit/http.test.js):

```js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const Http = require('../../src/services/http');
const { QrynError, QrynAbortedError, QrynTimeoutError } = require('../../src/types');

function mockFetch(impl) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url, init });
    return impl(url, init);
  };
  fn.calls = calls;
  return fn;
}

function jsonOk(body, headers = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json', ...headers }
  });
}

test('basic auth header is set', async () => {
  const fetchSpy = mockFetch(() => jsonOk({ ok: true }));
  const http = new Http('http://q', 60000, {}, { type: 'basic', username: 'u', password: 'p' }, {}, fetchSpy);
  await http.request('/health');
  const auth = fetchSpy.calls[0].init.headers.Authorization;
  assert.equal(auth, 'Basic ' + Buffer.from('u:p').toString('base64'));
});

test('bearer thunk auth header is awaited', async () => {
  const fetchSpy = mockFetch(() => jsonOk({}));
  const http = new Http('http://q', 60000, {}, { type: 'bearer', token: async () => 'fresh' }, {}, fetchSpy);
  await http.request('/health');
  assert.equal(fetchSpy.calls[0].init.headers.Authorization, 'Bearer fresh');
});

test('defaultOrgId becomes X-Scope-OrgID', async () => {
  const fetchSpy = mockFetch(() => jsonOk({}));
  const http = new Http('http://q', 60000, {}, undefined, { defaultOrgId: 'tenant-a' }, fetchSpy);
  await http.request('/health');
  assert.equal(fetchSpy.calls[0].init.headers['X-Scope-OrgID'], 'tenant-a');
});

test('per-call orgId overrides defaultOrgId', async () => {
  const fetchSpy = mockFetch(() => jsonOk({}));
  const http = new Http('http://q', 60000, {}, undefined, { defaultOrgId: 'tenant-a' }, fetchSpy);
  await http.request('/health', { orgId: 'tenant-b' });
  assert.equal(fetchSpy.calls[0].init.headers['X-Scope-OrgID'], 'tenant-b');
});

test('per-call timeoutMs maps an AbortError to QrynTimeoutError', async () => {
  const fetchSpy = mockFetch(async (_url, init) => {
    await new Promise((resolve, reject) => {
      init.signal.addEventListener('abort', () => {
        const err = new Error('aborted');
        err.name = 'AbortError';
        reject(err);
      }, { once: true });
    });
  });
  const http = new Http('http://q', 60000, {}, undefined, {}, fetchSpy);
  await assert.rejects(
    () => http.request('/slow', { timeoutMs: 5 }),
    (err) => err instanceof QrynTimeoutError && typeof err.elapsedMs === 'number'
  );
});

test('caller AbortSignal maps to QrynAbortedError', async () => {
  const fetchSpy = mockFetch(async (_url, init) => {
    await new Promise((resolve, reject) => {
      init.signal.addEventListener('abort', () => {
        const err = new Error('aborted');
        err.name = 'AbortError';
        reject(err);
      }, { once: true });
    });
  });
  const http = new Http('http://q', 60000, {}, undefined, {}, fetchSpy);
  const ac = new AbortController();
  const reason = new Error('user-cancel');
  setTimeout(() => ac.abort(reason), 5);
  await assert.rejects(
    () => http.request('/slow', { signal: ac.signal, timeoutMs: 60000 }),
    (err) => err instanceof QrynAbortedError && err.reason === reason
  );
});

test('non-2xx still throws QrynError', async () => {
  const fetchSpy = mockFetch(() => new Response(JSON.stringify({ msg: 'bad' }), {
    status: 400,
    headers: { 'content-type': 'application/json' }
  }));
  const http = new Http('http://q', 60000, {}, undefined, {}, fetchSpy);
  await assert.rejects(
    () => http.request('/x'),
    (err) => err instanceof QrynError && err.statusCode === 400
  );
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL — `Http` constructor signature has changed; tests blow up on the extra args.

- [ ] **Step 3: Reimplement `Http`**

Replace the entire content of [src/services/http.js](../../../src/services/http.js):

```js
'use strict';

const { URL } = require('url');
const {
  QrynError,
  QrynAbortedError,
  QrynTimeoutError,
  QrynResponse
} = require('../types');
const { resolveAuthHeaders } = require('./auth');
const { anySignal } = require('../utils/abort');

/**
 * Handles HTTP requests for QrynClient.
 */
class Http {
  /**
   * @param {string} baseUrl
   * @param {number} timeout - default per-request timeout in ms.
   * @param {Object} headers - default headers, merged before auth.
   * @param {import('./auth').QrynAuth|undefined} auth
   * @param {Object} [opts]
   * @param {import('../utils/retry').RetryOptions} [opts.retry]
   * @param {string} [opts.defaultOrgId]
   * @param {typeof globalThis.fetch} [fetchImpl] - injected for testing.
   */
  constructor(baseUrl, timeout, headers, auth, opts = {}, fetchImpl = globalThis.fetch) {
    this.baseUrl = new URL(baseUrl);
    this.timeout = timeout;
    this.headers = headers;
    this.auth = auth;
    this.defaultRetry = opts.retry;
    this.defaultOrgId = opts.defaultOrgId;
    this.fetchImpl = fetchImpl;
  }

  /**
   * @param {string} path
   * @param {Object} [options]
   * @param {string} [options.method]
   * @param {Object} [options.headers]
   * @param {*} [options.body]
   * @param {AbortSignal} [options.signal]
   * @param {number} [options.timeoutMs]
   * @param {string} [options.orgId]
   * @returns {Promise<QrynResponse>}
   */
  async request(path, options = {}) {
    const url = new URL(path, this.baseUrl);
    const effectiveTimeout = options.timeoutMs ?? this.timeout;

    const authHeaders = await resolveAuthHeaders(this.auth);
    const orgId = options.orgId ?? this.defaultOrgId;

    const headers = {
      ...this.headers,
      ...options.headers,
      ...authHeaders
    };
    if (orgId) headers['X-Scope-OrgID'] = orgId;

    const timeoutSignal = AbortSignal.timeout(effectiveTimeout);
    const signal = options.signal
      ? anySignal([options.signal, timeoutSignal])
      : timeoutSignal;

    const startedAt = Date.now();
    let response;
    try {
      response = await this.fetchImpl(url.toString(), {
        method: options.method,
        headers,
        body: options.body,
        signal
      });
    } catch (error) {
      if (error && error.name === 'AbortError') {
        if (options.signal && options.signal.aborted) {
          throw new QrynAbortedError(
            'Request aborted by caller',
            options.signal.reason,
            path
          );
        }
        throw new QrynTimeoutError(
          `Request timed out after ${effectiveTimeout}ms`,
          Date.now() - startedAt,
          path
        );
      }
      throw new QrynError(
        `Request failed: ${error.message} ${error?.cause?.message ?? ''}`.trim(),
        400,
        error.cause,
        path
      );
    }

    let body = {};
    const ct = (response.headers && response.headers.get && response.headers.get('content-type')) || '';
    if (response.status !== 204) {
      if (ct.includes('application/json')) {
        body = await response.json().catch(() => ({}));
      } else if (ct) {
        const text = await response.text().catch(() => '');
        body = text || {};
      }
    }

    if (!response.ok) {
      throw new QrynError(`HTTP error! status: ${response.status}`, response.status, body, path);
    }

    return new QrynResponse(body, response.status, response.headers, path);
  }
}

module.exports = Http;
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test`
Expected: all `http.test.js` tests pass; previous tests still green.

- [ ] **Step 5: Smoke-check the public surface**

Run: `node -e "require('./src')"`
Expected: exits 0.

- [ ] **Step 6: Commit**

```bash
git add src/services/http.js tests/unit/http.test.js
git commit -m "rebuild Http around per-call options, async auth, and typed abort/timeout errors"
```

---

## Task 8: HTTP retry policy

Layer the retry loop on top of the per-call pipeline from Task 7. Each attempt gets the full `timeoutMs` budget. Caller `AbortSignal` short-circuits the loop.

**Files:**
- Modify: [src/services/http.js](../../../src/services/http.js)
- Modify: [tests/unit/http.test.js](../../../tests/unit/http.test.js)

- [ ] **Step 1: Add the failing test**

Append to [tests/unit/http.test.js](../../../tests/unit/http.test.js):

```js
test('retry: 503 retried up to attempts then fails', async () => {
  let calls = 0;
  const fetchSpy = mockFetch(() => {
    calls++;
    return new Response('boom', { status: 503 });
  });
  const http = new Http('http://q', 60000, {}, undefined, {
    retry: { attempts: 3, baseDelayMs: 1, maxDelayMs: 1 }
  }, fetchSpy);
  await assert.rejects(() => http.request('/x'));
  assert.equal(calls, 3);
});

test('retry: 200 returns immediately, no extra calls', async () => {
  let calls = 0;
  const fetchSpy = mockFetch(() => { calls++; return jsonOk({ ok: true }); });
  const http = new Http('http://q', 60000, {}, undefined, {
    retry: { attempts: 3, baseDelayMs: 1, maxDelayMs: 1 }
  }, fetchSpy);
  await http.request('/x');
  assert.equal(calls, 1);
});

test('retry: 400 not retried', async () => {
  let calls = 0;
  const fetchSpy = mockFetch(() => {
    calls++;
    return new Response(JSON.stringify({ err: 'bad' }), {
      status: 400,
      headers: { 'content-type': 'application/json' }
    });
  });
  const http = new Http('http://q', 60000, {}, undefined, {
    retry: { attempts: 3, baseDelayMs: 1, maxDelayMs: 1 }
  }, fetchSpy);
  await assert.rejects(() => http.request('/x'));
  assert.equal(calls, 1);
});

test('retry: 429 honors Retry-After header', async () => {
  let calls = 0;
  const fetchSpy = mockFetch(() => {
    calls++;
    if (calls === 1) {
      return new Response('limit', { status: 429, headers: { 'Retry-After': '0' } });
    }
    return jsonOk({ ok: true });
  });
  const http = new Http('http://q', 60000, {}, undefined, {
    retry: { attempts: 3, baseDelayMs: 5000, maxDelayMs: 5000 }
  }, fetchSpy);
  const t0 = Date.now();
  await http.request('/x');
  const elapsed = Date.now() - t0;
  // baseDelayMs=5000 would force a long wait; Retry-After:0 must short-circuit it.
  assert.ok(elapsed < 1000, `expected <1s, got ${elapsed}ms`);
  assert.equal(calls, 2);
});

test('retry: caller-aborted signal stops the loop', async () => {
  let calls = 0;
  const fetchSpy = mockFetch(async (_url, init) => {
    calls++;
    return new Response('boom', { status: 503 });
  });
  const http = new Http('http://q', 60000, {}, undefined, {
    retry: { attempts: 5, baseDelayMs: 50, maxDelayMs: 50 }
  }, fetchSpy);
  const ac = new AbortController();
  setTimeout(() => ac.abort(new Error('cancel')), 20);
  await assert.rejects(
    () => http.request('/x', { signal: ac.signal }),
    (err) => err instanceof QrynAbortedError
  );
  assert.ok(calls < 5, `expected loop to short-circuit, got ${calls} calls`);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test`
Expected: the new tests fail (no retry loop yet).

- [ ] **Step 3: Add the retry loop to `Http.request`**

Edit [src/services/http.js](../../../src/services/http.js). Add imports:

```js
const {
  DEFAULT_RETRY,
  computeBackoff,
  parseRetryAfter,
  isRetryableStatus,
  isRetryableNetworkError
} = require('../utils/retry');
```

Add a private helper method below `request` and refactor `request` to delegate to it. The new shape of the class:

```js
async request(path, options = {}) {
  const retryOpts = { ...DEFAULT_RETRY, ...this.defaultRetry, ...options.retry };
  const attempts = Math.max(1, retryOpts.attempts);

  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    if (options.signal && options.signal.aborted) {
      throw new QrynAbortedError('Request aborted by caller', options.signal.reason, path);
    }
    try {
      return await this.#singleRequest(path, options);
    } catch (error) {
      lastError = error;

      // Caller abort: never retry.
      if (error instanceof QrynAbortedError) throw error;

      const isLast = attempt === attempts;
      if (isLast) throw error;

      let delayMs;
      if (error instanceof QrynError && typeof error.statusCode === 'number') {
        const retryAfterFromCustom = retryOpts.retryOn
          ? retryOpts.retryOn(error.statusCode, attempt)
          : isRetryableStatus(error.statusCode);
        if (!retryAfterFromCustom) throw error;

        const headerVal = error.cause && error.cause.headers
          ? error.cause.headers.get && error.cause.headers.get('retry-after')
          : null;
        const fromHeader = error.statusCode === 429 ? parseRetryAfter(headerVal) : null;
        delayMs = fromHeader != null ? fromHeader : computeBackoff(attempt, retryOpts);
      } else if (isRetryableNetworkError(error) || (error instanceof QrynError && error.cause && isRetryableNetworkError(error.cause))) {
        delayMs = computeBackoff(attempt, retryOpts);
      } else {
        throw error;
      }

      await this.#sleep(delayMs, options.signal);
    }
  }
  throw lastError;
}

async #singleRequest(path, options) {
  const url = new URL(path, this.baseUrl);
  const effectiveTimeout = options.timeoutMs ?? this.timeout;

  const authHeaders = await resolveAuthHeaders(this.auth);
  const orgId = options.orgId ?? this.defaultOrgId;

  const headers = { ...this.headers, ...options.headers, ...authHeaders };
  if (orgId) headers['X-Scope-OrgID'] = orgId;

  const timeoutSignal = AbortSignal.timeout(effectiveTimeout);
  const signal = options.signal ? anySignal([options.signal, timeoutSignal]) : timeoutSignal;

  const startedAt = Date.now();
  let response;
  try {
    response = await this.fetchImpl(url.toString(), {
      method: options.method,
      headers,
      body: options.body,
      signal
    });
  } catch (error) {
    if (error && error.name === 'AbortError') {
      if (options.signal && options.signal.aborted) {
        throw new QrynAbortedError('Request aborted by caller', options.signal.reason, path);
      }
      throw new QrynTimeoutError(
        `Request timed out after ${effectiveTimeout}ms`,
        Date.now() - startedAt,
        path
      );
    }
    throw new QrynError(
      `Request failed: ${error.message} ${error?.cause?.message ?? ''}`.trim(),
      400,
      error.cause,
      path
    );
  }

  let body = {};
  const ct = (response.headers && response.headers.get && response.headers.get('content-type')) || '';
  if (response.status !== 204) {
    if (ct.includes('application/json')) {
      body = await response.json().catch(() => ({}));
    } else if (ct) {
      const text = await response.text().catch(() => '');
      body = text || {};
    }
  }

  if (!response.ok) {
    const cause = { headers: response.headers, body };
    throw new QrynError(`HTTP error! status: ${response.status}`, response.status, cause, path);
  }

  return new QrynResponse(body, response.status, response.headers, path);
}

#sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (ms <= 0) return resolve();
    const timer = setTimeout(resolve, ms);
    if (signal) {
      const onAbort = () => {
        clearTimeout(timer);
        reject(new QrynAbortedError('Request aborted by caller', signal.reason));
      };
      signal.addEventListener('abort', onAbort, { once: true });
    }
  });
}
```

Note that `QrynError.cause` for non-2xx responses now carries `{ headers, body }` so the retry loop can read `Retry-After`. The previous shape of `QrynError.cause` was the raw response body; this is a near-internal detail (no documented consumer reads `.cause`), but document it in the error JSDoc if you touch [qrynError.js](../../../src/types/qrynError.js).

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test`
Expected: all `http.test.js` tests pass.

- [ ] **Step 5: Smoke-check the existing client paths**

Run: `node -e "const {QrynClient} = require('./src'); new QrynClient({baseUrl:'http://x'}); console.log('ok')"`
Expected: `ok`.

- [ ] **Step 6: Commit**

```bash
git add src/services/http.js tests/unit/http.test.js
git commit -m "add retry loop with backoff, jitter and Retry-After"
```

---

## Task 9: Plumb `opts` through `PromReader` and existing pushes

The push paths and the existing prom reader must accept the new per-call opts (`signal`, `timeoutMs`, `retry`, `orgId`). No behavioral change for callers who don't pass them.

**Files:**
- Modify: [src/clients/prometheus.js](../../../src/clients/prometheus.js)
- Modify: [src/clients/loki.js](../../../src/clients/loki.js)

- [ ] **Step 1: Update `PromReader` (the `Read` class) methods**

Edit [src/clients/prometheus.js](../../../src/clients/prometheus.js) `Read` class. Each method accepts a trailing `opts` arg and threads it through. Specifically:

```js
async query(query, opts = {}) {
  return this.service.request('/api/v1/query', {
    method: 'POST',
    headers: this.headers(),
    body: { query },
    signal: opts.signal,
    timeoutMs: opts.timeoutMs,
    retry: opts.retry,
    orgId: opts.orgId ?? this.options?.orgId
  }).catch(error => {
    if (error instanceof QrynError) throw error;
    throw new QrynError(`Prometheus query failed: ${error.message}`, error.statusCode);
  });
}

async queryRange(query, start, end, step, opts = {}) {
  return this.service.request('/api/v1/query_range', {
    method: 'POST',
    headers: this.headers(),
    body: new URLSearchParams({ query, start, end, step }),
    signal: opts.signal,
    timeoutMs: opts.timeoutMs,
    retry: opts.retry,
    orgId: opts.orgId ?? this.options?.orgId
  }).catch(error => {
    if (error instanceof QrynError) throw error;
    throw new QrynError(`Prometheus query range failed: ${error.message}`, error.statusCode);
  });
}

async labels(opts = {}) {
  return this.service.request('/api/v1/labels', {
    method: 'GET',
    headers: this.headers(),
    signal: opts.signal,
    timeoutMs: opts.timeoutMs,
    retry: opts.retry,
    orgId: opts.orgId ?? this.options?.orgId
  }).catch(error => {
    if (error instanceof QrynError) throw error;
    throw new QrynError(`Prometheus labels retrieval failed: ${error.message}`, error.statusCode);
  });
}

async labelValues(labelName, opts = {}) {
  return this.service.request(`/api/v1/label/${labelName}/values`, {
    method: 'GET',
    headers: this.headers(),
    signal: opts.signal,
    timeoutMs: opts.timeoutMs,
    retry: opts.retry,
    orgId: opts.orgId ?? this.options?.orgId
  }).catch(error => {
    if (error instanceof QrynError) throw error;
    throw new QrynError(`Prometheus label values retrieval failed: ${error.message}`, error.statusCode);
  });
}

async series(match, start, end, opts = {}) {
  let params = new URLSearchParams({ start, end });
  if (!match) throw new QrynError('match parameter is required');
  if (typeof match === 'string') match = [match];
  match.forEach(m => params.append('match[]', m));

  return this.service.request('/api/v1/series', {
    method: 'POST',
    headers: this.headers(),
    body: params,
    signal: opts.signal,
    timeoutMs: opts.timeoutMs,
    retry: opts.retry,
    orgId: opts.orgId ?? this.options?.orgId
  }).catch(error => {
    if (error instanceof QrynError) throw error;
    throw new QrynError(`Prometheus series retrieval failed: ${error.message}`, error.statusCode);
  });
}

async rules(opts = {}) {
  return this.service.request('/api/v1/rules', {
    method: 'GET',
    headers: this.headers(),
    signal: opts.signal,
    timeoutMs: opts.timeoutMs,
    retry: opts.retry,
    orgId: opts.orgId ?? this.options?.orgId
  }).catch(error => {
    if (error instanceof QrynError) throw error;
    throw new QrynError(`Prometheus rules retrieval failed: ${error.message}`, error.statusCode);
  });
}
```

(Update each method's JSDoc to add `@param {ReadOpts} [opts]`.)

- [ ] **Step 2: Update `Prometheus.push` to forward `opts.signal`/`opts.timeoutMs`/`opts.retry`**

In the same file, in the `Prometheus` class `push` method, replace the `service.request(...)` call:

```js
return this.service.request('/api/v1/prom/remote/write', {
  method: 'POST',
  headers: this.headers(options),
  body: compressedBuffer,
  signal: options && options.signal,
  timeoutMs: options && options.timeoutMs,
  retry: options && options.retry
}).then(res => {
  metrics.forEach(metric => metric.confirm());
  return res;
}).catch(error => {
  metrics.forEach(metric => metric.undo());
  if (error instanceof QrynError) throw error;
  throw new QrynError(`Prometheus Remote Write push failed: ${error.message}`, error.statusCode);
});
```

(`headers(options)` already pulls `orgId` out and sets `X-Scope-OrgID`; do not also pass `orgId` to `request`, or it'll be set twice — same outcome but redundant.)

- [ ] **Step 3: Update `Loki.push` similarly**

In [src/clients/loki.js](../../../src/clients/loki.js), update the `service.request` call inside `push`:

```js
const response = await this.service.request('/loki/api/v1/push', {
  method: 'POST',
  headers,
  body: JSON.stringify(payload),
  signal: options.signal,
  timeoutMs: options.timeoutMs,
  retry: options.retry
});
```

- [ ] **Step 4: Smoke-check the require graph**

Run: `node -e "require('./src')"`
Expected: exits 0.

- [ ] **Step 5: Run all tests**

Run: `npm test`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/clients/prometheus.js src/clients/loki.js
git commit -m "plumb per-call opts (signal, timeoutMs, retry) through prom and loki write paths"
```

---

## Task 10: `LokiReader` — new client

**Files:**
- Create: [src/clients/loki-read.js](../../../src/clients/loki-read.js)
- Modify: [src/clients/loki.js](../../../src/clients/loki.js)
- Create: [tests/unit/loki-read.test.js](../../../tests/unit/loki-read.test.js)

- [ ] **Step 1: Write the failing test**

Create [tests/unit/loki-read.test.js](../../../tests/unit/loki-read.test.js):

```js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const Http = require('../../src/services/http');

function jsonOk(body) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' }
  });
}

function fetchCapture(impl) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url: String(url), init });
    return impl ? impl(url, init) : jsonOk({ status: 'success', data: {} });
  };
  fn.calls = calls;
  return fn;
}

function makeClient(fetchSpy) {
  const http = new Http('http://q', 60000, {}, undefined, {}, fetchSpy);
  const Loki = require('../../src/clients/loki');
  return new Loki(http).createReader({ orgId: 'tenant-a' });
}

test('query: GET /loki/api/v1/query with normalized time', async () => {
  const fetchSpy = fetchCapture();
  const reader = makeClient(fetchSpy);
  await reader.query('{job="x"} |= `boom`', new Date(1700000000000));
  const call = fetchSpy.calls[0];
  assert.match(call.url, /\/loki\/api\/v1\/query\?/);
  assert.match(call.url, /query=%7Bjob%3D%22x%22%7D/);
  assert.match(call.url, /time=1700000000000000000/);
  assert.equal(call.init.method, 'GET');
  assert.equal(call.init.headers['X-Scope-OrgID'], 'tenant-a');
});

test('queryRange: passes step, limit, direction', async () => {
  const fetchSpy = fetchCapture();
  const reader = makeClient(fetchSpy);
  await reader.queryRange('{job="x"}', 1700000000, 1700003600, '15s', 100, 'backward');
  const call = fetchSpy.calls[0];
  assert.match(call.url, /step=15s/);
  assert.match(call.url, /limit=100/);
  assert.match(call.url, /direction=backward/);
  assert.match(call.url, /start=1700000000000000000/);
  assert.match(call.url, /end=1700003600000000000/);
});

test('labels: omits start/end when not given', async () => {
  const fetchSpy = fetchCapture();
  const reader = makeClient(fetchSpy);
  await reader.labels();
  const call = fetchSpy.calls[0];
  assert.match(call.url, /\/loki\/api\/v1\/labels(\?|$)/);
  assert.doesNotMatch(call.url, /start=/);
  assert.doesNotMatch(call.url, /end=/);
});

test('labelValues: encodes label name', async () => {
  const fetchSpy = fetchCapture();
  const reader = makeClient(fetchSpy);
  await reader.labelValues('job');
  assert.match(fetchSpy.calls[0].url, /\/loki\/api\/v1\/label\/job\/values/);
});

test('series: repeated match[] params', async () => {
  const fetchSpy = fetchCapture();
  const reader = makeClient(fetchSpy);
  await reader.series(['{a="1"}', '{b="2"}'], 1700000000, 1700003600);
  const call = fetchSpy.calls[0];
  // URLSearchParams encodes both as repeated match%5B%5D=
  assert.match(call.url, /match%5B%5D=%7Ba%3D%221%22%7D/);
  assert.match(call.url, /match%5B%5D=%7Bb%3D%222%22%7D/);
});

test('per-call opts.orgId overrides reader-level orgId', async () => {
  const fetchSpy = fetchCapture();
  const reader = makeClient(fetchSpy);
  await reader.labels(undefined, undefined, { orgId: 'tenant-b' });
  assert.equal(fetchSpy.calls[0].init.headers['X-Scope-OrgID'], 'tenant-b');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL — `loki-read` module not found and no `createReader` on Loki.

- [ ] **Step 3: Implement `LokiReader`**

Create [src/clients/loki-read.js](../../../src/clients/loki-read.js):

```js
'use strict';

const { QrynError } = require('../types');
const { toNanos } = require('../utils/time');

/**
 * Loki read client — LogQL queries, labels, label values, series.
 * @see https://grafana.com/docs/loki/latest/reference/loki-http-api/
 */
class LokiReader {
  /**
   * @param {import('../services/http')} service
   * @param {{ orgId?: string }} [options]
   */
  constructor(service, options = {}) {
    this.service = service;
    this.options = options;
  }

  /**
   * Instant LogQL query.
   * @param {string} query
   * @param {Date|number|string} [time]
   * @param {import('./read-opts').ReadOpts} [opts]
   */
  async query(query, time, opts = {}) {
    const params = new URLSearchParams();
    params.set('query', query);
    if (time !== undefined) params.set('time', toNanos(time));
    return this.#get('/loki/api/v1/query', params, opts, 'query');
  }

  /**
   * Range LogQL query.
   */
  async queryRange(query, start, end, step, limit, direction, opts = {}) {
    const params = new URLSearchParams();
    params.set('query', query);
    params.set('start', toNanos(start));
    params.set('end', toNanos(end));
    if (step !== undefined) params.set('step', String(step));
    if (limit !== undefined) params.set('limit', String(limit));
    if (direction !== undefined) params.set('direction', String(direction));
    return this.#get('/loki/api/v1/query_range', params, opts, 'queryRange');
  }

  /**
   * List label names.
   */
  async labels(start, end, opts = {}) {
    const params = new URLSearchParams();
    if (start !== undefined) params.set('start', toNanos(start));
    if (end !== undefined) params.set('end', toNanos(end));
    return this.#get('/loki/api/v1/labels', params, opts, 'labels');
  }

  /**
   * Values for a single label.
   */
  async labelValues(label, start, end, match, opts = {}) {
    if (!label) throw new QrynError('label parameter is required');
    const params = new URLSearchParams();
    if (start !== undefined) params.set('start', toNanos(start));
    if (end !== undefined) params.set('end', toNanos(end));
    if (match !== undefined) params.set('query', String(match));
    return this.#get(
      `/loki/api/v1/label/${encodeURIComponent(label)}/values`,
      params,
      opts,
      'labelValues'
    );
  }

  /**
   * Series matching one or more matchers.
   */
  async series(matchers, start, end, opts = {}) {
    if (!matchers) throw new QrynError('matchers parameter is required');
    const list = Array.isArray(matchers) ? matchers : [matchers];
    const params = new URLSearchParams();
    if (start !== undefined) params.set('start', toNanos(start));
    if (end !== undefined) params.set('end', toNanos(end));
    list.forEach(m => params.append('match[]', m));
    return this.#get('/loki/api/v1/series', params, opts, 'series');
  }

  /**
   * @param {string} basePath
   * @param {URLSearchParams} params
   * @param {Object} opts
   * @param {string} verb - method label for error messages
   */
  async #get(basePath, params, opts, verb) {
    const qs = params.toString();
    const path = qs ? `${basePath}?${qs}` : basePath;
    return this.service.request(path, {
      method: 'GET',
      headers: this.#headers(opts),
      signal: opts.signal,
      timeoutMs: opts.timeoutMs,
      retry: opts.retry,
      orgId: opts.orgId ?? this.options.orgId
    }).catch(error => {
      if (error instanceof QrynError) throw error;
      throw new QrynError(`Loki ${verb} failed: ${error.message}`, error.statusCode);
    });
  }

  #headers(_opts) {
    return {
      'Accept': 'application/json'
    };
  }
}

module.exports = LokiReader;
```

- [ ] **Step 4: Add `createReader` to `Loki`**

Edit [src/clients/loki.js](../../../src/clients/loki.js). Add inside the `Loki` class:

```js
/**
 * Create a LokiReader bound to this client's service.
 * @param {{ orgId?: string }} [options]
 * @returns {import('./loki-read')}
 */
createReader(options = {}) {
  const LokiReader = require('./loki-read');
  return new LokiReader(this.service, options);
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test`
Expected: all `loki-read.test.js` tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/clients/loki-read.js src/clients/loki.js tests/unit/loki-read.test.js
git commit -m "add LokiReader (LogQL query/queryRange/labels/labelValues/series)"
```

---

## Task 11: Tempo alignment — `searchTags`, `searchTagValues`, `getTrace`, opts plumbing

**Files:**
- Modify: [src/clients/tempo.js](../../../src/clients/tempo.js)
- Create: [tests/unit/tempo.test.js](../../../tests/unit/tempo.test.js)

- [ ] **Step 1: Write the failing test**

Create [tests/unit/tempo.test.js](../../../tests/unit/tempo.test.js):

```js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const Http = require('../../src/services/http');
const TempoClient = require('../../src/clients/tempo');

function jsonOk(body) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' }
  });
}

function fetchCapture() {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url: String(url), init });
    return jsonOk({ traces: [] });
  };
  fn.calls = calls;
  return fn;
}

function client(fetchSpy) {
  const http = new Http('http://q', 60000, {}, undefined, {}, fetchSpy);
  return new TempoClient(http);
}

test('searchTags: scope query param', async () => {
  const fetchSpy = fetchCapture();
  const t = client(fetchSpy);
  await t.searchTags('span');
  assert.match(fetchSpy.calls[0].url, /\/api\/search\/tags\?scope=span$/);
});

test('searchTags: scope omitted when not given', async () => {
  const fetchSpy = fetchCapture();
  const t = client(fetchSpy);
  await t.searchTags();
  assert.match(fetchSpy.calls[0].url, /\/api\/search\/tags(\?)?$/);
});

test('searchTagValues: v1 path encodes tag', async () => {
  const fetchSpy = fetchCapture();
  const t = client(fetchSpy);
  await t.searchTagValues('service.name');
  assert.match(fetchSpy.calls[0].url, /\/api\/search\/tag\/service\.name\/values/);
});

test('getTrace: aliases getTraceSpansJson path', async () => {
  const fetchSpy = fetchCapture();
  const t = client(fetchSpy);
  await t.getTrace('abc123');
  assert.match(fetchSpy.calls[0].url, /\/api\/traces\/abc123\/json/);
});

test('search: SearchOpts object becomes query string with q', async () => {
  const fetchSpy = fetchCapture();
  const t = client(fetchSpy);
  await t.search({ q: '{ duration > 1s }', limit: 5, spss: 10 });
  const url = fetchSpy.calls[0].url;
  assert.match(url, /q=%7B\+duration\+%3E\+1s\+%7D/);
  assert.match(url, /limit=5/);
  assert.match(url, /spss=10/);
});

test('search: string input preserved (back-compat)', async () => {
  const fetchSpy = fetchCapture();
  const t = client(fetchSpy);
  await t.search('q=foo');
  assert.match(fetchSpy.calls[0].url, /\/api\/search\?q=foo$/);
});

test('opts.orgId sets X-Scope-OrgID', async () => {
  const fetchSpy = fetchCapture();
  const t = client(fetchSpy);
  await t.searchTags('span', { orgId: 'tenant-a' });
  assert.equal(fetchSpy.calls[0].init.headers['X-Scope-OrgID'], 'tenant-a');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test`
Expected: failures on `searchTags`/`searchTagValues`/`getTrace` (don't exist yet) and on the `search({...})` object form.

- [ ] **Step 3: Update `TempoClient`**

Replace the entire content of [src/clients/tempo.js](../../../src/clients/tempo.js):

```js
'use strict';

const { QrynError } = require('../types');

/**
 * Tempo client — read-side access to traces stored in qryn.
 * @see https://grafana.com/docs/tempo/latest/api_docs/
 */
class TempoClient {
  /**
   * @param {import('../services/http')} service
   */
  constructor(service) {
    this.service = service;
  }

  /**
   * TraceQL search.
   * The first argument has three accepted shapes:
   *   - string: treated as a raw query string fragment (back-compat).
   *   - URLSearchParams: serialized directly (back-compat).
   *   - SearchOpts object: { q, start, end, limit, spss } — built into the query string.
   *
   * @param {string|URLSearchParams|{q:string,start?:Date|number,end?:Date|number,limit?:number,spss?:number}} [searchParams]
   * @param {Object} [options]
   * @param {string} [options.orgId]
   * @param {AbortSignal} [options.signal]
   * @param {number} [options.timeoutMs]
   * @param {import('../utils/retry').RetryOptions} [options.retry]
   */
  async search(searchParams, options = {}) {
    const qs = this.#searchParamsToString(searchParams);
    return this.#get(`/api/search${qs ? `?${qs}` : ''}`, options, 'search');
  }

  /**
   * GET /api/search/tags
   * @param {'span'|'resource'|'intrinsic'} [scope]
   * @param {Object} [options] - opts.signal/timeoutMs/retry/orgId
   */
  async searchTags(scope, options = {}) {
    const path = scope ? `/api/search/tags?scope=${encodeURIComponent(scope)}` : '/api/search/tags';
    return this.#get(path, options, 'searchTags');
  }

  /**
   * GET /api/search/tag/{tag}/values  (v1)
   */
  async searchTagValues(tagName, options = {}) {
    if (!tagName) throw new QrynError('tagName is required');
    return this.#get(
      `/api/search/tag/${encodeURIComponent(tagName)}/values`,
      options,
      'searchTagValues'
    );
  }

  /**
   * GET /api/v2/search/tag/{tagName}/values
   */
  async searchTagValuesV2(tagName, searchParams, options = {}) {
    const qs = this.#searchParamsToString(searchParams);
    const path = `/api/v2/search/tag/${encodeURIComponent(tagName)}/values${qs ? `?${qs}` : ''}`;
    return this.#get(path, options, 'searchTagValuesV2');
  }

  /**
   * GET /api/traces/{traceId}/json
   * Existing method — kept for back-compat.
   */
  async getTraceSpansJson(traceID, options = {}) {
    return this.#get(`/api/traces/${encodeURIComponent(traceID)}/json`, options, 'getTraceSpansJson');
  }

  /**
   * Spec-aligned alias of getTraceSpansJson.
   */
  async getTrace(traceID, options = {}) {
    return this.getTraceSpansJson(traceID, options);
  }

  // -- helpers --

  #searchParamsToString(input) {
    if (input == null) return '';
    if (typeof input === 'string') return input;
    if (input instanceof URLSearchParams) return input.toString();
    if (typeof input === 'object') {
      const params = new URLSearchParams();
      if (input.q !== undefined)     params.set('q', input.q);
      if (input.start !== undefined) params.set('start', String(input.start instanceof Date ? input.start.getTime() : input.start));
      if (input.end !== undefined)   params.set('end',   String(input.end   instanceof Date ? input.end.getTime()   : input.end));
      if (input.limit !== undefined) params.set('limit', String(input.limit));
      if (input.spss !== undefined)  params.set('spss',  String(input.spss));
      return params.toString();
    }
    return String(input);
  }

  #headers(options) {
    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    };
    if (options.orgId) headers['X-Scope-OrgID'] = options.orgId;
    return headers;
  }

  async #get(path, options, verb) {
    return this.service.request(path, {
      method: 'GET',
      headers: this.#headers(options),
      signal: options.signal,
      timeoutMs: options.timeoutMs,
      retry: options.retry,
      orgId: options.orgId
    }).catch(error => {
      if (error instanceof QrynError) throw error;
      throw new QrynError(`Tempo ${verb} failed: ${error.message}`, error.statusCode);
    });
  }
}

module.exports = TempoClient;
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test`
Expected: all `tempo.test.js` tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/clients/tempo.js tests/unit/tempo.test.js
git commit -m "align Tempo client with v1.1 spec (searchTags, searchTagValues, getTrace, opts)"
```

---

## Task 12: TypeScript declaration emission + hand-written `index.d.ts`

**Files:**
- Create: [tsconfig.json](../../../tsconfig.json)
- Create: [tsconfig.types.json](../../../tsconfig.types.json)
- Create: [index.d.ts](../../../index.d.ts)
- Modify: [package.json](../../../package.json)
- Modify: [.gitignore](../../../.gitignore) (add `dist/`)

- [ ] **Step 1: Add `typescript` as a devDependency**

Run: `npm install --save-dev typescript@^5.4.0`
Expected: dep installs cleanly.

- [ ] **Step 2: Create `tsconfig.json` (consumer-smoke)**

Create [tsconfig.json](../../../tsconfig.json):

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "moduleResolution": "node",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "noEmit": true,
    "types": ["node"]
  },
  "include": ["index.d.ts", "tests/types/**/*"]
}
```

- [ ] **Step 3: Create `tsconfig.types.json` (declaration emit)**

Create [tsconfig.types.json](../../../tsconfig.types.json):

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "moduleResolution": "node",
    "allowJs": true,
    "declaration": true,
    "emitDeclarationOnly": true,
    "skipLibCheck": true,
    "outDir": "dist/types",
    "esModuleInterop": true,
    "types": ["node"]
  },
  "include": ["src/**/*.js"]
}
```

- [ ] **Step 4: Create the hand-written `index.d.ts`**

Create [index.d.ts](../../../index.d.ts):

```ts
// Hand-written TypeScript surface for qryn-client.
// Augments declarations generated from JSDoc with named response types and
// generic QrynResponse<T>. The runtime contract is the JS source in src/.

import type { Agent } from 'http';

// -- core errors --

export class QrynError extends Error {
  statusCode: number | null;
  cause?: unknown;
  path?: string;
  constructor(message: string, statusCode?: number | null, cause?: unknown, path?: string);
}

export class QrynAbortedError extends QrynError {
  reason?: unknown;
}

export class QrynTimeoutError extends QrynError {
  elapsedMs: number;
}

// -- response wrapper --

export class QrynResponse<T = unknown> {
  response: T;
  status: number;
  headers: Headers | Record<string, string>;
  path: string;
  isSuccess(): boolean;
  getData(): T;
}

// -- auth --

export interface BasicAuth { type: 'basic'; username: string; password: string; }
export interface BearerAuth { type: 'bearer'; token: string | (() => Promise<string>); }
export interface CustomAuth {
  type: 'custom';
  headers: Record<string, string> | (() => Promise<Record<string, string>>);
}
export type QrynAuth = BasicAuth | BearerAuth | CustomAuth;

// -- retry / read opts --

export interface RetryOptions {
  attempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  retryOn?: (status: number, attempt: number) => boolean;
}

export interface ReadOpts {
  signal?: AbortSignal;
  timeoutMs?: number;
  retry?: RetryOptions;
  orgId?: string;
}

// -- client config --

export interface QrynClientOptions {
  baseUrl?: string;
  auth?: QrynAuth | { username: string; password: string };  // legacy shape accepted (deprecated)
  headers?: Record<string, string>;
  timeout?: number;
  retry?: RetryOptions;
  defaultOrgId?: string;
  agent?: Agent;
}

// -- Loki --

export interface Stream {
  addEntry(timestamp: number | string | Date, line: string): void;
}

export interface LokiPushOptions extends ReadOpts {
  async?: boolean | string;
  fpLimit?: number;
  ttlDays?: number;
}

export interface LokiInstantResponse {
  status: 'success' | string;
  data: { resultType: string; result: unknown[] };
}
export interface LokiRangeResponse extends LokiInstantResponse {}
export interface SeriesResponse {
  status: 'success' | string;
  data: Array<Record<string, string>>;
}

export class LokiReader {
  query(query: string, time?: Date | number | string, opts?: ReadOpts): Promise<QrynResponse<LokiInstantResponse>>;
  queryRange(
    query: string,
    start: Date | number | string,
    end: Date | number | string,
    step?: string,
    limit?: number,
    direction?: 'forward' | 'backward',
    opts?: ReadOpts
  ): Promise<QrynResponse<LokiRangeResponse>>;
  labels(start?: Date | number | string, end?: Date | number | string, opts?: ReadOpts): Promise<QrynResponse<{ status: string; data: string[] }>>;
  labelValues(label: string, start?: Date | number | string, end?: Date | number | string, match?: string, opts?: ReadOpts): Promise<QrynResponse<{ status: string; data: string[] }>>;
  series(matchers: string[] | string, start?: Date | number | string, end?: Date | number | string, opts?: ReadOpts): Promise<QrynResponse<SeriesResponse>>;
}

export class Loki {
  push(streams: Stream[], options?: LokiPushOptions): Promise<QrynResponse<unknown>>;
  createReader(options?: { orgId?: string }): LokiReader;
}

// -- Prometheus --

export interface Metric {
  addSample(value: number, timestamp?: number): void;
}

export interface PromPushOptions extends ReadOpts {
  async?: boolean | string;
  fpLimit?: number;
  ttlDays?: number;
}

export class PromReader {
  query(query: string, opts?: ReadOpts): Promise<QrynResponse<unknown>>;
  queryRange(query: string, start: number, end: number, step: string, opts?: ReadOpts): Promise<QrynResponse<unknown>>;
  labels(opts?: ReadOpts): Promise<QrynResponse<unknown>>;
  labelValues(labelName: string, opts?: ReadOpts): Promise<QrynResponse<unknown>>;
  series(match: string | string[], start: number, end: number, opts?: ReadOpts): Promise<QrynResponse<unknown>>;
  rules(opts?: ReadOpts): Promise<QrynResponse<unknown>>;
}

export class Prometheus {
  push(metrics: Metric[], options?: PromPushOptions): Promise<QrynResponse<unknown> | undefined>;
  createReader(options?: { orgId?: string }): PromReader;
}

// -- Tempo --

export interface SearchOpts {
  q: string;
  start?: Date | number;
  end?: Date | number;
  limit?: number;
  spss?: number;
}

export interface TempoSearchResponse {
  traces?: Array<{
    traceID: string;
    rootServiceName?: string;
    rootTraceName?: string;
    durationMs?: number;
    startTimeUnixNano?: string;
    spanCount?: number;
  }>;
}

export interface TraceResponse { batches: unknown[]; }

export class TempoClient {
  search(searchParams?: string | URLSearchParams | SearchOpts, options?: ReadOpts): Promise<QrynResponse<TempoSearchResponse>>;
  searchTags(scope?: 'span' | 'resource' | 'intrinsic', options?: ReadOpts): Promise<QrynResponse<{ tagNames?: string[] }>>;
  searchTagValues(tagName: string, options?: ReadOpts): Promise<QrynResponse<{ tagValues?: string[] }>>;
  searchTagValuesV2(tagName: string, searchParams?: string | URLSearchParams, options?: ReadOpts): Promise<QrynResponse<unknown>>;
  getTrace(traceId: string, options?: ReadOpts): Promise<QrynResponse<TraceResponse>>;
  getTraceSpansJson(traceId: string, options?: ReadOpts): Promise<QrynResponse<TraceResponse>>;
}

// -- Collector --

export interface CollectorOptions {
  maxBulkSize?: number;
  maxTimeout?: number;
}

export class Collector {
  pushStream(stream: Stream): void;
  pushMetric(metric: Metric): void;
  flush(): Promise<void>;
}

// -- Client --

export class QrynClient {
  constructor(config: QrynClientOptions);
  loki: Loki;
  prom: Prometheus;
  tempo: TempoClient;

  createCollector(config?: CollectorOptions): Collector;
  createStream(labels: Record<string, string>): Stream;
  createMetric(input: { name: string; labels?: Record<string, string> }): Metric;
}
```

- [ ] **Step 5: Update package.json**

Edit [package.json](../../../package.json):

```json
{
  "main": "src/index.js",
  "types": "index.d.ts",
  "files": ["src", "index.d.ts", "dist/types"],
  "scripts": {
    "test": "node --test tests/unit/",
    "test:types": "tsc -p tsconfig.json",
    "build:types": "tsc -p tsconfig.types.json"
  }
}
```

(Keep all existing fields. Merge — do not overwrite — `scripts`. The `test` script is unchanged from Task 1.)

- [ ] **Step 6: Update `.gitignore`**

Add to [.gitignore](../../../.gitignore):

```
dist/
node_modules/
```

(`node_modules/` may already be present; ensure both are.)

- [ ] **Step 7: Verify type emit**

Run: `npm run build:types`
Expected: exits 0; populates `dist/types/`.

- [ ] **Step 8: Commit**

```bash
git add tsconfig.json tsconfig.types.json index.d.ts package.json package-lock.json .gitignore
git commit -m "add hand-written index.d.ts and tsc declaration pipeline"
```

(If `package-lock.json` is in `.gitignore` and not tracked, `git add` will warn — that's fine, just don't include it. Per [AGENTS.md §11](../../../AGENTS.md), `package-lock.json` is intentionally not tracked.)

---

## Task 13: Consumer type-smoke

**Files:**
- Create: [tests/types/consumer-smoke.ts](../../../tests/types/consumer-smoke.ts)

- [ ] **Step 1: Write the consumer smoke**

Create [tests/types/consumer-smoke.ts](../../../tests/types/consumer-smoke.ts):

```ts
import {
  QrynClient,
  QrynError,
  QrynAbortedError,
  QrynTimeoutError,
  type QrynAuth,
  type RetryOptions,
  type ReadOpts,
  type SearchOpts,
} from 'qryn-client';

// 1. Constructor with each auth shape.
const basic = new QrynClient({
  baseUrl: 'http://localhost:3100',
  auth: { type: 'basic', username: 'u', password: 'p' },
});

const bearer = new QrynClient({
  baseUrl: 'http://x',
  auth: { type: 'bearer', token: async () => 'tok' },
});

const custom = new QrynClient({
  baseUrl: 'http://x',
  auth: { type: 'custom', headers: { 'X-Api-Key': 'k' } },
});

// 2. Legacy shape still compiles (deprecated at runtime).
const legacy = new QrynClient({
  baseUrl: 'http://x',
  auth: { username: 'u', password: 'p' },
});

// 3. RetryOptions + defaultOrgId.
const retry: RetryOptions = { attempts: 3, baseDelayMs: 200, maxDelayMs: 5000 };
const withRetry = new QrynClient({
  baseUrl: 'http://x',
  retry,
  defaultOrgId: 'tenant-a',
});

// 4. Loki reader.
async function lokiSmoke() {
  const reader = basic.loki.createReader({ orgId: 'tenant-a' });
  const opts: ReadOpts = { timeoutMs: 30_000, retry };
  const inst = await reader.query('{job="x"}', new Date(), opts);
  inst.response.data.resultType;

  const range = await reader.queryRange(
    '{job="x"}',
    new Date(Date.now() - 3600_000),
    new Date(),
    '15s',
    100,
    'backward',
    opts
  );
  range.response.data.result;

  const labels = await reader.labels(undefined, undefined, opts);
  labels.response.data;

  await reader.labelValues('job', undefined, undefined, undefined, opts);
  await reader.series(['{a="1"}'], undefined, undefined, opts);
}

// 5. Tempo.
async function tempoSmoke() {
  const t = basic.tempo;
  const search: SearchOpts = { q: '{ duration > 1s }', limit: 5 };
  await t.search(search, { signal: new AbortController().signal });
  await t.searchTags('span');
  await t.searchTagValues('service.name');
  await t.getTrace('abc');
}

// 6. Errors are catchable as classes.
async function errorSmoke() {
  try {
    await basic.tempo.search({ q: 'x' });
  } catch (e) {
    if (e instanceof QrynAbortedError) e.reason;
    if (e instanceof QrynTimeoutError) e.elapsedMs;
    if (e instanceof QrynError) e.statusCode;
  }
}

void [basic, bearer, custom, legacy, withRetry, lokiSmoke, tempoSmoke, errorSmoke];
```

- [ ] **Step 2: Symlink (or npm-link) the package locally**

The smoke imports from `'qryn-client'`. For `tsc` to resolve it, add a path mapping in [tsconfig.json](../../../tsconfig.json) instead of installing the package:

Edit [tsconfig.json](../../../tsconfig.json) — replace the file:

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "moduleResolution": "node",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "noEmit": true,
    "types": ["node"],
    "baseUrl": ".",
    "paths": {
      "qryn-client": ["./index.d.ts"]
    }
  },
  "include": ["index.d.ts", "tests/types/**/*"]
}
```

- [ ] **Step 3: Run the type smoke**

Run: `npm run test:types`
Expected: exits 0 (no type errors).

If it fails, the failure is real and must be fixed in [index.d.ts](../../../index.d.ts) or the consuming smoke.

- [ ] **Step 4: Commit**

```bash
git add tests/types/consumer-smoke.ts tsconfig.json
git commit -m "add consumer type-smoke that compiles under --strict"
```

---

## Task 14: Runtime smoke examples

**Files:**
- Create: [example/loki-read.js](../../../example/loki-read.js)
- Create: [example/tempo.js](../../../example/tempo.js)

These are not run in CI — they exist for the maintainer to validate against a live qryn. Keep them minimal and consistent with the existing [example/read.js](../../../example/read.js).

- [ ] **Step 1: Create `example/loki-read.js`**

Create [example/loki-read.js](../../../example/loki-read.js):

```js
const { QrynClient } = require('../src');

const baseUrl = process.env.QYRN_READ_URL;
const orgId   = process.env.QYRN_ORG_ID;

if (!baseUrl) {
  console.error('Set QYRN_READ_URL (and optionally QYRN_ORG_ID) to run this smoke.');
  process.exit(2);
}

(async () => {
  const client = new QrynClient({ baseUrl, defaultOrgId: orgId });
  const reader = client.loki.createReader();

  console.log('-- labels --');
  const labels = await reader.labels();
  console.log(labels.response);

  console.log('-- queryRange --');
  const end = new Date();
  const start = new Date(end.getTime() - 60 * 60 * 1000);
  const range = await reader.queryRange('{job=~".+"}', start, end, '60s', 5, 'backward');
  console.log(JSON.stringify(range.response, null, 2).slice(0, 500));
})().catch(err => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 2: Create `example/tempo.js`**

Create [example/tempo.js](../../../example/tempo.js):

```js
const { QrynClient } = require('../src');

const baseUrl = process.env.QYRN_READ_URL;
const orgId   = process.env.QYRN_ORG_ID;

if (!baseUrl) {
  console.error('Set QYRN_READ_URL (and optionally QYRN_ORG_ID) to run this smoke.');
  process.exit(2);
}

(async () => {
  const client = new QrynClient({ baseUrl, defaultOrgId: orgId });

  console.log('-- searchTags --');
  const tags = await client.tempo.searchTags();
  console.log(tags.response);

  console.log('-- search --');
  const found = await client.tempo.search({ q: '{}', limit: 5 });
  console.log(JSON.stringify(found.response, null, 2).slice(0, 500));
})().catch(err => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 3: Smoke-load both files (no network)**

Run: `node -c example/loki-read.js && node -c example/tempo.js`
Expected: exits 0 (syntax check only).

- [ ] **Step 4: Commit**

```bash
git add example/loki-read.js example/tempo.js
git commit -m "add example smokes for loki reader and tempo"
```

---

## Task 15: README + architecture docs

**Files:**
- Modify: [README.md](../../../README.md)
- Modify: [docs/architecture.md](../../../docs/architecture.md)

- [ ] **Step 1: Update README**

Add a "Migration to 1.1.0" section near the top of [README.md](../../../README.md), after the install instructions. Document:

- New auth shape (basic/bearer/custom) with examples.
- The legacy `{username, password}` shape still works but emits `DeprecationWarning` with code `QRYN_AUTH_LEGACY`.
- New constructor options: `retry`, `defaultOrgId`.
- Default `timeout` is now 60 s (was 5 s). Set `timeout: 5000` to restore the old default.
- New per-call `opts` on every read method: `{ signal, timeoutMs, retry, orgId }`.
- New errors: `QrynAbortedError`, `QrynTimeoutError`.
- New `client.loki.createReader()` reader with full LogQL surface.
- New tempo methods: `searchTags`, `searchTagValues`, `getTrace`.

For each new surface, include a 5-10 line code example. Do not duplicate text already in `docs/architecture.md`; link to it.

- [ ] **Step 2: Update architecture.md**

Edit [docs/architecture.md](../../../docs/architecture.md). Update the HTTP and auth sections to reflect:

- `Http.request` is now a per-call options pipeline (not constructor-time-only).
- Retry + abort/timeout flow.
- The auth resolver and the legacy shim.

- [ ] **Step 3: Commit**

```bash
git add README.md docs/architecture.md
git commit -m "document v1.1.0 surface (auth shapes, retry, abort, loki reader, tempo additions)"
```

---

## Task 16: Bump version + final verification

**Files:**
- Modify: [package.json](../../../package.json)

This is the last commit before merging. Run the full validation matrix.

- [ ] **Step 1: Run all unit tests**

Run: `npm test`
Expected: all green.

- [ ] **Step 2: Type emit + consumer smoke**

Run: `npm run build:types && npm run test:types`
Expected: both exit 0.

- [ ] **Step 3: Public-surface require smoke**

Run: `node -e "const m = require('./src'); console.log(Object.keys(m).sort())"`
Expected: includes `Collector`, `Metric`, `QrynAbortedError`, `QrynClient`, `QrynError`, `QrynTimeoutError`, `Stream`.

- [ ] **Step 4: Bump version**

Edit [package.json](../../../package.json) — change `"version": "1.0.10"` to `"version": "1.1.0"`.

- [ ] **Step 5: Commit**

```bash
git add package.json
git commit -m "bump version 1.0.10 -> 1.1.0"
```

- [ ] **Step 6: Inspect the commit graph**

Run: `git log --oneline main..HEAD`
Expected: a clean, lowercase, imperative-style commit list ending with the version bump.

---

## Out-of-scope reminder

Do **not** in this branch:
- Add any docker-compose / integration test infrastructure (P2).
- Add the `QrynBadRequestError` / `QrynServerError` / `QrynNetworkError` hierarchy (P2 — only the two new error classes from this plan exist now).
- Migrate any source file to TypeScript (recorded "Will not do").
- Edit [src/services/remote.proto](../../../src/services/remote.proto) (vendored upstream).
- Edit [.github/workflows/npm_release.yml](../../../.github/workflows/npm_release.yml).
- Refactor the `Loki.push` / `Prometheus.push` validators (separate todo item, not this plan).

If a step blocks on something not covered here, stop and surface it. Don't improvise.
