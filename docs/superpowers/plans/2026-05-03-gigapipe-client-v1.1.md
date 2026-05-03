# gigapipe-client v1.1.0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the v1.1 P0+P1 surface (pluggable auth, retry, AbortSignal, ReadOpts plumbed through every read/write, Tempo additions, `.d.ts`, `defaultOrgId`) on top of the `rebranding` branch — non-breaking minor release of `gigapipe-client`.

**Architecture:** Single shared `Http` instance per `GigapipeClient`. Per-call options pipeline (`signal`, `timeoutMs`, `retry`, `orgId`) overrides per-instance defaults. Hand-rolled retry loop with backoff + jitter + `Retry-After`. Discriminated-union auth resolved on every request (thunks supported). Hand-written `index.d.ts`. No new runtime deps.

**Tech Stack:** Node 18+, native `fetch`, `node:test`, `node:assert`, hand-written `.d.ts` validated by `tsc --noEmit --strict`.

---

## Conventions for every task

- **Branch:** `rebranding-v1.1` (forked from `origin/rebranding`).
- **Test runner:** `npm test` invokes `node --test test/*.test.js`. Use `node --test test/<file>.test.js` to run a single file.
- **Assertion style:** `node:assert` (strict).
- **Mock style:** `globalThis.fetch` is monkey-patched per test, restored in cleanup. No `sinon`/`nock`.
- **All existing tests must continue passing** at every commit (verify with `npm test`).
- **Commit cadence:** one commit per task. Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`, `test:`).

---

## Task 1: Add `anySignal` polyfill for Node 18

**Why:** `AbortSignal.any` is Node 20+. We must combine the caller's signal with a per-attempt timeout signal on Node 18.

**Files:**
- Create: `src/utils/abort.js`
- Create: `test/abort.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
// test/abort.test.js
const { describe, it } = require('node:test');
const assert = require('node:assert');
const { anySignal } = require('../src/utils/abort');

describe('anySignal', () => {
  it('returns a single signal that aborts when any input aborts', () => {
    const a = new AbortController();
    const b = new AbortController();
    const combined = anySignal([a.signal, b.signal]);
    assert.equal(combined.aborted, false);
    a.abort('reason-a');
    assert.equal(combined.aborted, true);
    assert.equal(combined.reason, 'reason-a');
  });

  it('returns an already-aborted signal when any input is already aborted', () => {
    const a = new AbortController();
    a.abort('preexisting');
    const b = new AbortController();
    const combined = anySignal([a.signal, b.signal]);
    assert.equal(combined.aborted, true);
    assert.equal(combined.reason, 'preexisting');
  });

  it('handles a single signal input', () => {
    const a = new AbortController();
    const combined = anySignal([a.signal]);
    assert.equal(combined.aborted, false);
    a.abort();
    assert.equal(combined.aborted, true);
  });

  it('handles undefined entries (filters them)', () => {
    const a = new AbortController();
    const combined = anySignal([undefined, a.signal, null]);
    assert.equal(combined.aborted, false);
    a.abort();
    assert.equal(combined.aborted, true);
  });

  it('returns a never-aborting signal when no valid signals are passed', () => {
    const combined = anySignal([undefined, null]);
    assert.equal(combined.aborted, false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/abort.test.js`
Expected: FAIL — `Cannot find module '../src/utils/abort'`.

- [ ] **Step 3: Implement**

```javascript
// src/utils/abort.js

/**
 * Combine multiple AbortSignals into one. The returned signal aborts
 * as soon as any input aborts, propagating the reason of the first one.
 *
 * Falsy entries are filtered. If no valid signals remain, returns a
 * signal that never aborts (a fresh AbortController.signal).
 *
 * Polyfill for AbortSignal.any (Node 20+) so this library runs on Node 18.
 *
 * @param {Array<AbortSignal|undefined|null>} signals
 * @returns {AbortSignal}
 */
function anySignal(signals) {
  const valid = (signals || []).filter(s => s && typeof s.addEventListener === 'function');
  if (valid.length === 0) return new AbortController().signal;

  // If any is already aborted, return a pre-aborted signal preserving the reason.
  for (const s of valid) {
    if (s.aborted) return AbortSignal.abort(s.reason);
  }

  const controller = new AbortController();
  const onAbort = (sig) => () => {
    if (controller.signal.aborted) return;
    controller.abort(sig.reason);
  };
  for (const s of valid) {
    s.addEventListener('abort', onAbort(s), { once: true });
  }
  return controller.signal;
}

module.exports = { anySignal };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/abort.test.js`
Expected: PASS — 5 tests pass.

- [ ] **Step 5: Run full suite (regression check)**

Run: `npm test`
Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/utils/abort.js test/abort.test.js
git commit -m "feat: add anySignal util for combining AbortSignals (Node 18 compatible)"
```

---

## Task 2: Add `toNanos` time helper

**Why:** Loki time params accept `Date | number | string` and require nanosecond precision. Helper isolates the unit-detection rules.

**Files:**
- Create: `src/utils/time.js`
- Create: `test/time.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
// test/time.test.js
const { describe, it } = require('node:test');
const assert = require('node:assert');
const { toNanos } = require('../src/utils/time');

describe('toNanos', () => {
  it('converts Date to nanoseconds string', () => {
    const d = new Date('2026-01-01T00:00:00Z');
    assert.equal(toNanos(d), String(d.getTime() * 1_000_000));
  });

  it('treats number < 1e12 as seconds', () => {
    // 1_700_000_000 sec = ~Nov 2023
    assert.equal(toNanos(1_700_000_000), '1700000000000000000');
  });

  it('treats number in [1e12, 1e15) as milliseconds', () => {
    // 1_700_000_000_000 ms
    assert.equal(toNanos(1_700_000_000_000), '1700000000000000000');
  });

  it('treats number >= 1e15 as nanoseconds', () => {
    assert.equal(toNanos(1_700_000_000_000_000_000), '1700000000000000000');
  });

  it('passes string through unchanged', () => {
    assert.equal(toNanos('1700000000000000000'), '1700000000000000000');
    assert.equal(toNanos('not-a-number-but-trusted'), 'not-a-number-but-trusted');
  });

  it('returns undefined for nullish input', () => {
    assert.equal(toNanos(undefined), undefined);
    assert.equal(toNanos(null), undefined);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/time.test.js`
Expected: FAIL — `Cannot find module '../src/utils/time'`.

- [ ] **Step 3: Implement**

```javascript
// src/utils/time.js

/**
 * Normalize a time input to a nanoseconds string.
 *
 * Rules:
 *   - Date            → date.getTime() * 1e6 (string)
 *   - number < 1e12   → seconds (multiply by 1e9)
 *   - number < 1e15   → milliseconds (multiply by 1e6)
 *   - number >= 1e15  → nanoseconds (no change)
 *   - string          → returned unchanged (caller knows the unit)
 *   - null/undefined  → undefined (lets callers omit timestamps cleanly)
 *
 * Returns a string to preserve precision past JS's 2^53 number limit.
 *
 * @param {Date|number|string|null|undefined} input
 * @returns {string|undefined}
 */
function toNanos(input) {
  if (input === null || input === undefined) return undefined;
  if (input instanceof Date) return String(input.getTime() * 1_000_000);
  if (typeof input === 'string') return input;
  if (typeof input === 'number') {
    if (input < 1e12) return String(Math.trunc(input * 1_000_000_000));
    if (input < 1e15) return String(Math.trunc(input * 1_000_000));
    return String(Math.trunc(input));
  }
  return undefined;
}

module.exports = { toNanos };
```

- [ ] **Step 4: Run tests**

Run: `node --test test/time.test.js && npm test`
Expected: PASS for both.

- [ ] **Step 5: Commit**

```bash
git add src/utils/time.js test/time.test.js
git commit -m "feat: add toNanos time normalization helper for Loki reader"
```

---

## Task 3: Add `GigapipeAbortedError` and `GigapipeTimeoutError`

**Why:** Source spec acceptance — caller-aborted requests must throw a typed `GigapipeAbortedError`, distinct from network or timeout errors.

**Files:**
- Create: `src/types/gigapipeAbortedError.js`
- Create: `src/types/gigapipeTimeoutError.js`
- Modify: `src/types/index.js` (add exports)
- Create: `test/typed-errors.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
// test/typed-errors.test.js
const { describe, it } = require('node:test');
const assert = require('node:assert');
const { GigapipeError, GigapipeAbortedError, GigapipeTimeoutError } = require('../src/types');

describe('GigapipeAbortedError', () => {
  it('extends GigapipeError', () => {
    const err = new GigapipeAbortedError('aborted', { reason: 'user-cancel' });
    assert.ok(err instanceof Error);
    assert.ok(err instanceof GigapipeError);
    assert.ok(err instanceof GigapipeAbortedError);
    assert.equal(err.name, 'GigapipeAbortedError');
    assert.equal(err.reason, 'user-cancel');
  });

  it('defaults reason to undefined when not supplied', () => {
    const err = new GigapipeAbortedError('aborted');
    assert.equal(err.reason, undefined);
  });
});

describe('GigapipeTimeoutError', () => {
  it('extends GigapipeError and exposes elapsedMs', () => {
    const err = new GigapipeTimeoutError('timed out', { elapsedMs: 1234, path: '/loki/api/v1/query' });
    assert.ok(err instanceof GigapipeError);
    assert.equal(err.name, 'GigapipeTimeoutError');
    assert.equal(err.elapsedMs, 1234);
    assert.equal(err.path, '/loki/api/v1/query');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/typed-errors.test.js`
Expected: FAIL — `GigapipeAbortedError` is not a constructor (or undefined import).

- [ ] **Step 3: Implement the error classes**

```javascript
// src/types/gigapipeAbortedError.js
const GigapipeError = require('./gigapipeError');

/**
 * Thrown when a request is aborted via the caller's AbortSignal,
 * distinct from a per-attempt timeout (GigapipeTimeoutError).
 */
class GigapipeAbortedError extends GigapipeError {
  constructor(message, { reason, path } = {}) {
    super(message, null, undefined, path);
    this.name = 'GigapipeAbortedError';
    this.reason = reason;
  }
}

module.exports = GigapipeAbortedError;
```

```javascript
// src/types/gigapipeTimeoutError.js
const GigapipeError = require('./gigapipeError');

/**
 * Thrown when a request attempt exceeds its timeoutMs budget.
 * Distinct from caller-initiated abort (GigapipeAbortedError).
 */
class GigapipeTimeoutError extends GigapipeError {
  constructor(message, { elapsedMs, path } = {}) {
    super(message, null, undefined, path);
    this.name = 'GigapipeTimeoutError';
    this.elapsedMs = elapsedMs;
  }
}

module.exports = GigapipeTimeoutError;
```

- [ ] **Step 4: Wire exports**

Modify `src/types/index.js`:

```javascript
const GigapipeError = require('./gigapipeError');
const GigapipeResponse = require('./gigapipeResponse');
const GigapipeAbortedError = require('./gigapipeAbortedError');
const GigapipeTimeoutError = require('./gigapipeTimeoutError');

class NetworkError extends GigapipeError {
  constructor(message, options = {}) {
    super(message, options);
    this.name = 'NetworkError';
    this.statusCode = options.statusCode;
  }
}

class ValidationError extends GigapipeError {
  constructor(message, options = {}) {
    super(message, options);
    this.name = 'ValidationError';
    this.field = options.field;
  }
}

module.exports = {
  NetworkError,
  ValidationError,
  GigapipeError,
  GigapipeResponse,
  GigapipeAbortedError,
  GigapipeTimeoutError
};
```

- [ ] **Step 5: Run tests**

Run: `node --test test/typed-errors.test.js && npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/types/gigapipeAbortedError.js src/types/gigapipeTimeoutError.js src/types/index.js test/typed-errors.test.js
git commit -m "feat: add GigapipeAbortedError and GigapipeTimeoutError"
```

---

## Task 4: Add retry helpers (backoff, retry-after, retryable status)

**Why:** P0 #4 acceptance — backoff + jitter, configurable `retryOn`, honor `Retry-After` (seconds OR HTTP-date), don't retry on caller abort or non-listed 4xx.

**Files:**
- Create: `src/utils/retry.js`
- Create: `test/retry.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
// test/retry.test.js
const { describe, it, mock } = require('node:test');
const assert = require('node:assert');
const {
  computeBackoffMs,
  isRetryableStatus,
  parseRetryAfterMs,
  isRetryableNetworkError,
  DEFAULT_RETRY_OPTIONS
} = require('../src/utils/retry');

describe('computeBackoffMs', () => {
  it('grows exponentially capped at maxDelayMs', () => {
    // Force jitter to 1.0 (worst case = full delay) by mocking Math.random
    const restore = mock.method(Math, 'random', () => 1);
    try {
      assert.equal(computeBackoffMs(1, 200, 5000), 200);
      assert.equal(computeBackoffMs(2, 200, 5000), 400);
      assert.equal(computeBackoffMs(3, 200, 5000), 800);
      assert.equal(computeBackoffMs(10, 200, 5000), 5000); // capped
    } finally {
      restore.mock.restore();
    }
  });

  it('applies full jitter (random scaling)', () => {
    const restore = mock.method(Math, 'random', () => 0);
    try {
      assert.equal(computeBackoffMs(3, 200, 5000), 0);
    } finally {
      restore.mock.restore();
    }
  });
});

describe('isRetryableStatus', () => {
  it('matches the spec set: 408, 429, 502, 503, 504', () => {
    for (const s of [408, 429, 502, 503, 504]) {
      assert.equal(isRetryableStatus(s), true, `status ${s} should be retryable`);
    }
  });

  it('does not match other 4xx', () => {
    for (const s of [400, 401, 403, 404, 422]) {
      assert.equal(isRetryableStatus(s), false, `status ${s} should NOT be retryable`);
    }
  });

  it('does not match 2xx/3xx', () => {
    assert.equal(isRetryableStatus(200), false);
    assert.equal(isRetryableStatus(304), false);
  });
});

describe('parseRetryAfterMs', () => {
  it('parses delta-seconds', () => {
    assert.equal(parseRetryAfterMs('5'), 5000);
    assert.equal(parseRetryAfterMs('  10 '), 10000);
  });

  it('parses HTTP-date, returning ms-from-now', () => {
    const future = new Date(Date.now() + 3000).toUTCString();
    const ms = parseRetryAfterMs(future);
    assert.ok(ms >= 2000 && ms <= 4000, `expected ~3000 ms, got ${ms}`);
  });

  it('returns null for unparseable / null input', () => {
    assert.equal(parseRetryAfterMs(null), null);
    assert.equal(parseRetryAfterMs(''), null);
    assert.equal(parseRetryAfterMs('not-a-date'), null);
  });

  it('clamps negative HTTP-date deltas to 0', () => {
    const past = new Date(Date.now() - 60_000).toUTCString();
    assert.equal(parseRetryAfterMs(past), 0);
  });
});

describe('isRetryableNetworkError', () => {
  it('matches the spec error codes', () => {
    for (const code of ['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'EAI_AGAIN']) {
      const err = new Error('boom');
      err.code = code;
      assert.equal(isRetryableNetworkError(err), true, `code ${code} should be retryable`);
      const wrapped = new Error('boom'); wrapped.cause = { code };
      assert.equal(isRetryableNetworkError(wrapped), true, `code ${code} as cause should be retryable`);
    }
  });

  it('does not match unrelated errors', () => {
    const err = new Error('not a network thing'); err.code = 'EACCES';
    assert.equal(isRetryableNetworkError(err), false);
    assert.equal(isRetryableNetworkError(null), false);
    assert.equal(isRetryableNetworkError(new Error('plain')), false);
  });
});

describe('DEFAULT_RETRY_OPTIONS', () => {
  it('matches spec defaults', () => {
    assert.deepEqual(DEFAULT_RETRY_OPTIONS, {
      attempts: 3,
      baseDelayMs: 200,
      maxDelayMs: 5000
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/retry.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```javascript
// src/utils/retry.js

const RETRYABLE_STATUSES = new Set([408, 429, 502, 503, 504]);
const RETRYABLE_NETWORK_CODES = new Set(['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'EAI_AGAIN']);

const DEFAULT_RETRY_OPTIONS = {
  attempts: 3,
  baseDelayMs: 200,
  maxDelayMs: 5000
};

/**
 * Exponential backoff with full jitter.
 * delay = random() * min(maxDelayMs, baseDelayMs * 2^(attempt-1))
 *
 * @param {number} attempt 1-indexed attempt number
 * @param {number} baseDelayMs
 * @param {number} maxDelayMs
 * @returns {number} delay in ms
 */
function computeBackoffMs(attempt, baseDelayMs, maxDelayMs) {
  const exp = Math.min(maxDelayMs, baseDelayMs * Math.pow(2, attempt - 1));
  return Math.floor(Math.random() * exp);
}

function isRetryableStatus(status) {
  return RETRYABLE_STATUSES.has(status);
}

function isRetryableNetworkError(err) {
  if (!err) return false;
  const code = err.code || (err.cause && err.cause.code);
  return RETRYABLE_NETWORK_CODES.has(code);
}

/**
 * Parse a Retry-After header value to ms-from-now.
 * Accepts delta-seconds OR HTTP-date.
 * Returns null when unparseable.
 */
function parseRetryAfterMs(headerValue) {
  if (headerValue === null || headerValue === undefined) return null;
  const v = String(headerValue).trim();
  if (v === '') return null;
  if (/^\d+$/.test(v)) return parseInt(v, 10) * 1000;
  const t = Date.parse(v);
  if (Number.isNaN(t)) return null;
  return Math.max(0, t - Date.now());
}

module.exports = {
  DEFAULT_RETRY_OPTIONS,
  computeBackoffMs,
  isRetryableStatus,
  isRetryableNetworkError,
  parseRetryAfterMs
};
```

- [ ] **Step 4: Run tests**

Run: `node --test test/retry.test.js && npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/utils/retry.js test/retry.test.js
git commit -m "feat: add retry helpers (backoff, retry-after, retryable-status)"
```

---

## Task 5: Refactor `Http.request` for per-call options + abort/timeout error mapping

**Why:** Foundation for everything else. Adds `signal`, `timeoutMs`, `orgId`, `authResolver`, plus distinguishes caller-abort from timeout when `fetch` throws `AbortError`. Retain native fetch + GigapipeError throws so existing tests still pass.

**Files:**
- Modify: `src/services/http.js` (full rewrite)
- Create: `test/http-options.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
// test/http-options.test.js
const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const Http = require('../src/services/http');
const { GigapipeError, GigapipeAbortedError, GigapipeTimeoutError } = require('../src/types');

const realFetch = globalThis.fetch;
let calls;

function mockFetch(impl) {
  calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    return await impl({ url, init });
  };
}

beforeEach(() => { calls = []; });
afterEach(() => { globalThis.fetch = realFetch; });

function jsonResponse(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers }
  });
}

describe('Http.request — per-call options', () => {
  it('uses opts.timeoutMs to set the per-attempt timeout (overrides instance default)', async () => {
    let observedSignal;
    mockFetch(({ init }) => {
      observedSignal = init.signal;
      return Promise.resolve(jsonResponse({ ok: true }));
    });
    const http = new Http('http://localhost:3100', 5000, {}, { username: 'u', password: 'p' });
    await http.request('/x', { method: 'GET', timeoutMs: 100 });
    assert.ok(observedSignal instanceof AbortSignal);
  });

  it('combines caller signal with timeout — aborts when caller aborts', async () => {
    mockFetch(({ init }) => new Promise((_, reject) => {
      init.signal.addEventListener('abort', () => {
        const err = new Error('aborted');
        err.name = 'AbortError';
        reject(err);
      }, { once: true });
    }));
    const http = new Http('http://localhost:3100', 5000, {}, { username: 'u', password: 'p' });
    const ctl = new AbortController();
    const p = http.request('/x', { method: 'GET', signal: ctl.signal, timeoutMs: 60_000 });
    setTimeout(() => ctl.abort('user-cancel'), 10);
    await assert.rejects(p, (err) => err instanceof GigapipeAbortedError && err.reason === 'user-cancel');
  });

  it('throws GigapipeTimeoutError when timeout fires (caller signal not aborted)', async () => {
    mockFetch(({ init }) => new Promise((_, reject) => {
      init.signal.addEventListener('abort', () => {
        const err = new Error('timed out');
        err.name = 'AbortError';
        reject(err);
      }, { once: true });
    }));
    const http = new Http('http://localhost:3100', 5000, {}, { username: 'u', password: 'p' });
    await assert.rejects(
      http.request('/x', { method: 'GET', timeoutMs: 20 }),
      (err) => err instanceof GigapipeTimeoutError && typeof err.elapsedMs === 'number'
    );
  });

  it('sets X-Scope-OrgID from opts.orgId, overriding existing header', async () => {
    let observedHeaders;
    mockFetch(({ init }) => {
      observedHeaders = init.headers;
      return Promise.resolve(jsonResponse({ ok: true }));
    });
    const http = new Http('http://localhost:3100', 5000, { 'X-Scope-OrgID': 'default' }, { username: 'u', password: 'p' });
    await http.request('/x', { method: 'GET', orgId: 'tenant-a' });
    assert.equal(observedHeaders['X-Scope-OrgID'], 'tenant-a');
  });

  it('keeps existing GigapipeError throws on non-2xx', async () => {
    mockFetch(() => Promise.resolve(new Response('boom', { status: 500 })));
    const http = new Http('http://localhost:3100', 5000, {}, { username: 'u', password: 'p' });
    await assert.rejects(http.request('/x', { method: 'GET' }), (err) => err instanceof GigapipeError && err.statusCode === 500);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/http-options.test.js`
Expected: FAIL — at least the first test (timeoutMs) and the abort/timeout typed-error tests fail (current code does not honor opts.signal/timeoutMs/orgId).

- [ ] **Step 3: Implement (full rewrite of `src/services/http.js`)**

```javascript
// src/services/http.js
const { URL } = require('url');
const {
  GigapipeError,
  GigapipeResponse,
  GigapipeAbortedError,
  GigapipeTimeoutError
} = require('../types');
const { anySignal } = require('../utils/abort');

/**
 * HTTP layer for GigapipeClient.
 *
 * Per-call request options (override instance defaults):
 *   - method, headers, body            (existing)
 *   - signal     — caller AbortSignal
 *   - timeoutMs  — per-attempt timeout (overrides instance timeout for this request)
 *   - orgId      — sets X-Scope-OrgID header (overrides instance header)
 *   - retry      — (handled in Task 6)
 *   - authResolver — (handled in Task 7)
 */
class Http {
  constructor(baseUrl, timeout, headers, auth) {
    this.baseUrl = new URL(baseUrl);
    this.timeout = timeout;
    this.headers = headers || {};
    this.#setBasicAuth(auth);
  }

  #setBasicAuth(auth) {
    if (auth && auth.username !== undefined && auth.password !== undefined) {
      this.basicAuth = Buffer.from(`${auth.username}:${auth.password}`).toString('base64');
    } else {
      this.basicAuth = null;
    }
  }

  /**
   * Make an HTTP request.
   * @param {string} path
   * @param {Object} options
   * @returns {Promise<GigapipeResponse>}
   * @throws {GigapipeError|GigapipeAbortedError|GigapipeTimeoutError}
   */
  async request(path, options = {}) {
    const url = new URL(path, this.baseUrl);

    const callerSignal = options.signal;
    const timeoutMs = options.timeoutMs ?? this.timeout;
    const timeoutSignal = AbortSignal.timeout(timeoutMs);
    const combinedSignal = anySignal([callerSignal, timeoutSignal]);

    const headers = { ...this.headers, ...options.headers };
    if (options.orgId) headers['X-Scope-OrgID'] = options.orgId;
    if (this.basicAuth) headers['Authorization'] = `Basic ${this.basicAuth}`;

    // Strip non-fetch options so they don't reach fetch().
    const { signal: _s, timeoutMs: _t, orgId: _o, retry: _r, authResolver: _a, ...rest } = options;
    const fetchOptions = { ...rest, headers, signal: combinedSignal };

    const startedAt = Date.now();
    let response;
    let res = {};
    try {
      response = await fetch(url.toString(), fetchOptions);
    } catch (error) {
      if (error && error.name === 'AbortError') {
        if (callerSignal && callerSignal.aborted) {
          throw new GigapipeAbortedError('Request aborted', { reason: callerSignal.reason, path });
        }
        throw new GigapipeTimeoutError(`Request timed out after ${timeoutMs}ms`, {
          elapsedMs: Date.now() - startedAt,
          path
        });
      }
      throw new GigapipeError(`Request failed: ${error.message}${error?.cause?.message ? ' ' + error.cause.message : ''}`, 400, error.cause || error, path);
    }

    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      res = await response.json();
    } else if (response.status !== 204) {
      res = await response.text();
    }

    if (!response.ok) {
      throw new GigapipeError(`HTTP error! status: ${response.status}`, response.status, res, path);
    }

    return new GigapipeResponse(res, response.status, response.headers, path);
  }
}

module.exports = Http;
```

- [ ] **Step 4: Run the new test file**

Run: `node --test test/http-options.test.js`
Expected: PASS — 5 tests.

- [ ] **Step 5: Run full suite**

Run: `npm test`
Expected: All tests pass (existing + new).

- [ ] **Step 6: Commit**

```bash
git add src/services/http.js test/http-options.test.js
git commit -m "feat: rebuild Http around per-call options and typed abort/timeout errors"
```

---

## Task 6: Add retry loop to `Http.request`

**Why:** P0 #4 — retry on listed network/HTTP errors with backoff + jitter + Retry-After. Each attempt gets a fresh `timeoutMs`. Caller signal abort breaks the chain immediately.

**Files:**
- Modify: `src/services/http.js`
- Create: `test/http-retry.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
// test/http-retry.test.js
const { describe, it, beforeEach, afterEach, mock } = require('node:test');
const assert = require('node:assert');
const Http = require('../src/services/http');
const { GigapipeError, GigapipeAbortedError } = require('../src/types');

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

function jsonResponse(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
}

describe('Http.request — retry loop', () => {
  it('retries on 503 then succeeds within attempts budget', async () => {
    let n = 0;
    globalThis.fetch = async () => {
      n++;
      if (n < 3) return new Response('busy', { status: 503 });
      return jsonResponse({ ok: true });
    };
    // Force jitter to 0 so tests are fast.
    const restore = mock.method(Math, 'random', () => 0);
    try {
      const http = new Http('http://localhost', 5000, {}, { username: 'u', password: 'p' });
      const out = await http.request('/x', { method: 'GET', retry: { attempts: 3, baseDelayMs: 1, maxDelayMs: 1 } });
      assert.equal(out.status, 200);
      assert.equal(n, 3);
    } finally { restore.mock.restore(); }
  });

  it('does not retry on 400', async () => {
    let n = 0;
    globalThis.fetch = async () => { n++; return new Response('nope', { status: 400 }); };
    const http = new Http('http://localhost', 5000, {}, { username: 'u', password: 'p' });
    await assert.rejects(http.request('/x', { method: 'GET', retry: { attempts: 3, baseDelayMs: 1, maxDelayMs: 1 } }),
      (err) => err instanceof GigapipeError && err.statusCode === 400);
    assert.equal(n, 1);
  });

  it('honors Retry-After (delta-seconds) on 429', async () => {
    let n = 0;
    const times = [];
    globalThis.fetch = async () => {
      times.push(Date.now()); n++;
      if (n === 1) return new Response('slow', { status: 429, headers: { 'retry-after': '0' } });
      return jsonResponse({ ok: true });
    };
    const http = new Http('http://localhost', 5000, {}, { username: 'u', password: 'p' });
    const out = await http.request('/x', { method: 'GET', retry: { attempts: 3, baseDelayMs: 999_999, maxDelayMs: 999_999 } });
    assert.equal(out.status, 200);
    // Used Retry-After=0 instead of the huge backoff; total elapsed << 1s.
    assert.ok(times[1] - times[0] < 500, 'should have used Retry-After=0, not the configured backoff');
  });

  it('aborts the chain immediately on caller signal', async () => {
    let n = 0;
    globalThis.fetch = async (url, init) => {
      n++;
      // Simulate the caller signal aborting between attempts.
      if (init.signal.aborted) {
        const err = new Error('aborted'); err.name = 'AbortError'; throw err;
      }
      return new Response('busy', { status: 503 });
    };
    const restore = mock.method(Math, 'random', () => 0);
    try {
      const http = new Http('http://localhost', 5000, {}, { username: 'u', password: 'p' });
      const ctl = new AbortController();
      const p = http.request('/x', { method: 'GET', signal: ctl.signal, retry: { attempts: 5, baseDelayMs: 50, maxDelayMs: 50 } });
      setTimeout(() => ctl.abort('cancel'), 10);
      await assert.rejects(p, (err) => err instanceof GigapipeAbortedError);
      assert.ok(n < 5, 'should not exhaust retry budget after caller abort');
    } finally { restore.mock.restore(); }
  });

  it('uses instance default retry options when opts.retry is omitted', async () => {
    let n = 0;
    globalThis.fetch = async () => { n++; return n < 2 ? new Response('busy', { status: 503 }) : jsonResponse({ ok: true }); };
    const restore = mock.method(Math, 'random', () => 0);
    try {
      const http = new Http('http://localhost', 5000, {}, { username: 'u', password: 'p' });
      http.defaultRetry = { attempts: 3, baseDelayMs: 1, maxDelayMs: 1 };
      const out = await http.request('/x', { method: 'GET' });
      assert.equal(out.status, 200);
      assert.equal(n, 2);
    } finally { restore.mock.restore(); }
  });

  it('attempts: 1 means no retries', async () => {
    let n = 0;
    globalThis.fetch = async () => { n++; return new Response('busy', { status: 503 }); };
    const http = new Http('http://localhost', 5000, {}, { username: 'u', password: 'p' });
    await assert.rejects(http.request('/x', { method: 'GET', retry: { attempts: 1 } }),
      (err) => err instanceof GigapipeError && err.statusCode === 503);
    assert.equal(n, 1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/http-retry.test.js`
Expected: FAIL — `request` does not loop.

- [ ] **Step 3: Modify `src/services/http.js` to add the retry loop**

Replace the body of `request(path, options = {})` with a wrapping `#requestWithRetry` and a `#requestOnce` helper. Full updated `request` and helpers:

```javascript
// at top of file, add the imports:
const {
  DEFAULT_RETRY_OPTIONS,
  computeBackoffMs,
  isRetryableStatus,
  isRetryableNetworkError,
  parseRetryAfterMs
} = require('../utils/retry');
```

Replace the `request` method with:

```javascript
  async request(path, options = {}) {
    const retry = { ...DEFAULT_RETRY_OPTIONS, ...(this.defaultRetry || {}), ...(options.retry || {}) };
    const callerSignal = options.signal;
    let lastError;

    for (let attempt = 1; attempt <= retry.attempts; attempt++) {
      if (callerSignal && callerSignal.aborted) {
        throw new (require('../types').GigapipeAbortedError)('Request aborted', { reason: callerSignal.reason, path });
      }
      try {
        return await this.#requestOnce(path, options);
      } catch (err) {
        lastError = err;
        const aborted = err && err.name === 'GigapipeAbortedError';
        if (aborted) throw err;
        if (attempt >= retry.attempts) throw err;
        const shouldRetry = (typeof retry.retryOn === 'function')
          ? retry.retryOn(err.statusCode || 0, attempt)
          : (isRetryableStatus(err.statusCode) || isRetryableNetworkError(err.cause) || isRetryableNetworkError(err));
        if (!shouldRetry) throw err;
        const retryAfter = err.headers && parseRetryAfterMs(err.headers.get && err.headers.get('retry-after'));
        const delayMs = (retryAfter !== null && retryAfter !== undefined)
          ? retryAfter
          : computeBackoffMs(attempt, retry.baseDelayMs, retry.maxDelayMs);
        await this.#sleep(delayMs, callerSignal);
      }
    }
    throw lastError;
  }

  #sleep(ms, callerSignal) {
    return new Promise((resolve, reject) => {
      const t = setTimeout(resolve, ms);
      if (callerSignal) {
        callerSignal.addEventListener('abort', () => {
          clearTimeout(t);
          const { GigapipeAbortedError } = require('../types');
          reject(new GigapipeAbortedError('Request aborted during backoff', { reason: callerSignal.reason }));
        }, { once: true });
      }
    });
  }
```

Then rename the existing single-shot body into `#requestOnce(path, options)` (the implementation from Task 5). Crucially, in `#requestOnce`, when throwing `GigapipeError` for a non-2xx response, attach `response.headers` so the retry loop can read `Retry-After`:

```javascript
    if (!response.ok) {
      const e = new GigapipeError(`HTTP error! status: ${response.status}`, response.status, res, path);
      e.headers = response.headers;
      throw e;
    }
```

- [ ] **Step 4: Run tests**

Run: `node --test test/http-retry.test.js && npm test`
Expected: PASS for both files.

- [ ] **Step 5: Commit**

```bash
git add src/services/http.js test/http-retry.test.js
git commit -m "feat: add retry loop with backoff, jitter and Retry-After"
```

---

## Task 7: Add discriminated-union auth resolver

**Why:** P0 #5 — `auth: { type: 'basic'|'bearer'|'custom', ... }` plus a thunk-based bearer/custom for token refresh on every request.

**Files:**
- Modify: `src/services/http.js` (add `#resolveAuthHeaders`)
- Create: `test/http-auth.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
// test/http-auth.test.js
const { describe, it, afterEach } = require('node:test');
const assert = require('node:assert');
const Http = require('../src/services/http');

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

function jsonResponse() { return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } }); }

describe('Http auth resolver', () => {
  it('basic: emits Basic Authorization header', async () => {
    let observed;
    globalThis.fetch = async (url, init) => { observed = init.headers; return jsonResponse(); };
    const http = new Http('http://localhost', 5000, {}, { type: 'basic', username: 'alice', password: 'secret' });
    await http.request('/x', { method: 'GET' });
    const expected = 'Basic ' + Buffer.from('alice:secret').toString('base64');
    assert.equal(observed['Authorization'], expected);
  });

  it('bearer with static token', async () => {
    let observed;
    globalThis.fetch = async (url, init) => { observed = init.headers; return jsonResponse(); };
    const http = new Http('http://localhost', 5000, {}, { type: 'bearer', token: 'tok-123' });
    await http.request('/x', { method: 'GET' });
    assert.equal(observed['Authorization'], 'Bearer tok-123');
  });

  it('bearer with thunk: resolved on every request', async () => {
    let n = 0;
    let observed;
    globalThis.fetch = async (url, init) => { observed = init.headers; return jsonResponse(); };
    const http = new Http('http://localhost', 5000, {}, { type: 'bearer', token: async () => `tok-${++n}` });
    await http.request('/x', { method: 'GET' });
    assert.equal(observed['Authorization'], 'Bearer tok-1');
    await http.request('/x', { method: 'GET' });
    assert.equal(observed['Authorization'], 'Bearer tok-2');
  });

  it('custom: returns headers map', async () => {
    let observed;
    globalThis.fetch = async (url, init) => { observed = init.headers; return jsonResponse(); };
    const http = new Http('http://localhost', 5000, {}, { type: 'custom', headers: { 'X-Api-Key': 'abc' } });
    await http.request('/x', { method: 'GET' });
    assert.equal(observed['X-Api-Key'], 'abc');
    assert.ok(!('Authorization' in observed) || observed['Authorization'] === undefined);
  });

  it('custom with thunk', async () => {
    let observed;
    globalThis.fetch = async (url, init) => { observed = init.headers; return jsonResponse(); };
    const http = new Http('http://localhost', 5000, {}, { type: 'custom', headers: async () => ({ 'X-Api-Key': 'fresh' }) });
    await http.request('/x', { method: 'GET' });
    assert.equal(observed['X-Api-Key'], 'fresh');
  });

  it('no auth: omits Authorization header', async () => {
    let observed;
    globalThis.fetch = async (url, init) => { observed = init.headers; return jsonResponse(); };
    const http = new Http('http://localhost', 5000, {}, undefined);
    await http.request('/x', { method: 'GET' });
    assert.equal(observed['Authorization'], undefined);
  });

  it('legacy { username, password } still works (back-compat)', async () => {
    let observed;
    globalThis.fetch = async (url, init) => { observed = init.headers; return jsonResponse(); };
    const http = new Http('http://localhost', 5000, {}, { username: 'u', password: 'p' });
    await http.request('/x', { method: 'GET' });
    const expected = 'Basic ' + Buffer.from('u:p').toString('base64');
    assert.equal(observed['Authorization'], expected);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/http-auth.test.js`
Expected: FAIL — bearer/custom tests fail (current Http only handles basic).

- [ ] **Step 3: Implement**

In `src/services/http.js`, replace `#setBasicAuth` with a polymorphic `#auth` setter and `async #resolveAuthHeaders()` method:

```javascript
  // Replace the existing constructor's auth setup line:
  // this.#setBasicAuth(auth)
  //
  // with:
  this.auth = this.#normalizeAuth(auth);
```

Add the helpers:

```javascript
  /**
   * Normalize either the legacy {username,password} or the new discriminated union to a single shape.
   * Returns null when no auth is configured.
   */
  #normalizeAuth(auth) {
    if (!auth) return null;
    if (auth.type === 'basic')  return { type: 'basic',  username: auth.username, password: auth.password };
    if (auth.type === 'bearer') return { type: 'bearer', token: auth.token };
    if (auth.type === 'custom') return { type: 'custom', headers: auth.headers };
    if (auth.username !== undefined && auth.password !== undefined) {
      // Legacy shape — same as basic.
      return { type: 'basic', username: auth.username, password: auth.password };
    }
    return null;
  }

  async #resolveAuthHeaders() {
    if (!this.auth) return {};
    if (this.auth.type === 'basic') {
      const b64 = Buffer.from(`${this.auth.username}:${this.auth.password}`).toString('base64');
      return { Authorization: `Basic ${b64}` };
    }
    if (this.auth.type === 'bearer') {
      const token = typeof this.auth.token === 'function' ? await this.auth.token() : this.auth.token;
      return { Authorization: `Bearer ${token}` };
    }
    if (this.auth.type === 'custom') {
      const h = typeof this.auth.headers === 'function' ? await this.auth.headers() : this.auth.headers;
      return { ...(h || {}) };
    }
    return {};
  }
```

In `#requestOnce`, replace the previous `if (this.basicAuth) headers['Authorization'] = ...` block with:

```javascript
    const authHeaders = await (options.authResolver
      ? options.authResolver()
      : this.#resolveAuthHeaders());
    Object.assign(headers, authHeaders);
```

Remove the `this.basicAuth` field and the `#setBasicAuth` method (replaced by `auth`/`#normalizeAuth`/`#resolveAuthHeaders`).

- [ ] **Step 4: Run tests**

Run: `node --test test/http-auth.test.js && npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/http.js test/http-auth.test.js
git commit -m "feat: add discriminated-union auth resolver with bearer/custom thunk support"
```

---

## Task 8: Auth back-compat shim with deprecation warning in `GigapipeClient`

**Why:** P0 #5 acceptance — accept the legacy `{username, password}` shape with a `process.emitWarning` so old consumers see a clear migration path.

**Files:**
- Modify: `src/index.js`
- Create: `test/client-auth-shim.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
// test/client-auth-shim.test.js
const { describe, it } = require('node:test');
const assert = require('node:assert');
const { GigapipeClient } = require('../src/index');

describe('GigapipeClient auth back-compat shim', () => {
  it('emits a DeprecationWarning when given legacy auth shape', () => {
    const seen = [];
    const handler = (warning) => seen.push(warning);
    process.on('warning', handler);
    try {
      // eslint-disable-next-line no-new
      new GigapipeClient({ baseUrl: 'http://localhost:3100', auth: { username: 'u', password: 'p' } });
      // emitWarning is sync within the same tick.
      const found = seen.find(w => w.code === 'GIGAPIPE_AUTH_LEGACY');
      assert.ok(found, 'expected a GIGAPIPE_AUTH_LEGACY warning');
    } finally {
      process.off('warning', handler);
    }
  });

  it('does NOT emit a warning when given the new typed auth shape', () => {
    const seen = [];
    const handler = (warning) => { if (warning.code === 'GIGAPIPE_AUTH_LEGACY') seen.push(warning); };
    process.on('warning', handler);
    try {
      // eslint-disable-next-line no-new
      new GigapipeClient({ baseUrl: 'http://localhost:3100', auth: { type: 'basic', username: 'u', password: 'p' } });
      assert.equal(seen.length, 0);
    } finally {
      process.off('warning', handler);
    }
  });

  it('does NOT emit a warning when no auth is provided', () => {
    const seen = [];
    const handler = (warning) => { if (warning.code === 'GIGAPIPE_AUTH_LEGACY') seen.push(warning); };
    process.on('warning', handler);
    try {
      // eslint-disable-next-line no-new
      new GigapipeClient({ baseUrl: 'http://localhost:3100' });
      assert.equal(seen.length, 0);
    } finally {
      process.off('warning', handler);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/client-auth-shim.test.js`
Expected: FAIL — first test fails (no warning emitted).

- [ ] **Step 3: Implement**

In `src/index.js`, before constructing `Http`, add:

```javascript
    let auth = config.auth;
    if (auth && auth.type === undefined && auth.username !== undefined) {
      process.emitWarning(
        "gigapipe-client: auth: { username, password } is deprecated; use auth: { type: 'basic', username, password }. The legacy shape will be removed in 2.0.0.",
        'DeprecationWarning',
        'GIGAPIPE_AUTH_LEGACY'
      );
      auth = { type: 'basic', username: auth.username, password: auth.password };
    }
```

Then pass `auth` (not `config.auth`) into `new Http(...)`.

- [ ] **Step 4: Run tests**

Run: `node --test test/client-auth-shim.test.js && npm test`
Expected: PASS — and the existing `test/gigapipe-client.test.js` (which uses the legacy shape) still passes; it will emit the deprecation warning but that doesn't fail the assertion.

- [ ] **Step 5: Commit**

```bash
git add src/index.js test/client-auth-shim.test.js
git commit -m "feat: add legacy-auth deprecation shim on GigapipeClient"
```

---

## Task 9: Constructor accepts `retry`, `defaultOrgId`, plumbs through

**Why:** Per source-spec `QrynClientOptions` (here renamed to `GigapipeClientOptions`).

**Files:**
- Modify: `src/index.js`
- Modify: `src/services/http.js` (already supports `defaultRetry` from Task 6; just confirm and add `defaultOrgId`)
- Create: `test/client-options.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
// test/client-options.test.js
const { describe, it, afterEach } = require('node:test');
const assert = require('node:assert');
const { GigapipeClient } = require('../src/index');

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

function ok() { return new Response(JSON.stringify({}), { status: 200, headers: { 'content-type': 'application/json' } }); }

describe('GigapipeClient new options', () => {
  it('plumbs defaultOrgId to every request as X-Scope-OrgID', async () => {
    let observed;
    globalThis.fetch = async (url, init) => { observed = init.headers; return ok(); };
    const client = new GigapipeClient({ baseUrl: 'http://localhost', auth: { type: 'basic', username: 'u', password: 'p' }, defaultOrgId: 'tenant-z' });
    await client.tempo.search('foo=bar');
    assert.equal(observed['X-Scope-OrgID'], 'tenant-z');
  });

  it('per-call orgId overrides defaultOrgId', async () => {
    let observed;
    globalThis.fetch = async (url, init) => { observed = init.headers; return ok(); };
    const client = new GigapipeClient({ baseUrl: 'http://localhost', auth: { type: 'basic', username: 'u', password: 'p' }, defaultOrgId: 'tenant-z' });
    await client.tempo.search('foo=bar', { orgId: 'tenant-a' });
    assert.equal(observed['X-Scope-OrgID'], 'tenant-a');
  });

  it('retry config flows from constructor as defaultRetry', () => {
    const client = new GigapipeClient({ baseUrl: 'http://localhost', auth: { type: 'basic', username: 'u', password: 'p' }, retry: { attempts: 5, baseDelayMs: 10, maxDelayMs: 50 } });
    // Reach into the http instance for verification.
    const http = client.tempo.service;
    assert.deepEqual(http.defaultRetry, { attempts: 5, baseDelayMs: 10, maxDelayMs: 50 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/client-options.test.js`
Expected: FAIL — `defaultOrgId` not honored, `defaultRetry` not set.

- [ ] **Step 3: Implement**

In `src/index.js` constructor, after the auth shim:

```javascript
    const retry = config.retry;
    const defaultOrgId = config.defaultOrgId;

    const http = new Http(baseUrl, timeout, headers, auth);
    if (retry) http.defaultRetry = retry;
    if (defaultOrgId) http.defaultOrgId = defaultOrgId;

    this.prom = new PrometheusClient(http);
    this.loki = new LokiClient(http);
    this.tempo = new TempoClient(http);
```

In `src/services/http.js`, in `#requestOnce`:

```javascript
    // After computing headers from this.headers + options.headers:
    const orgId = options.orgId || this.defaultOrgId;
    if (orgId) headers['X-Scope-OrgID'] = orgId;
```

- [ ] **Step 4: Run tests**

Run: `node --test test/client-options.test.js && npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/index.js src/services/http.js test/client-options.test.js
git commit -m "feat: plumb retry and defaultOrgId from GigapipeClient constructor"
```

---

## Task 10: Plumb `opts` through Loki push and reader

**Why:** P0 #1 + #3 + #4 — every Loki method accepts `{ signal, timeoutMs, retry, orgId }` and the existing `parse` flag still works.

**Files:**
- Modify: `src/clients/loki.js`
- Create: `test/loki-opts.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
// test/loki-opts.test.js
const { describe, it, afterEach } = require('node:test');
const assert = require('node:assert');
const { GigapipeClient } = require('../src/index');

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

function ok(body = {}) { return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } }); }

describe('Loki — opts plumbing', () => {
  it('reader.query passes orgId and forwards signal', async () => {
    let observed;
    globalThis.fetch = async (url, init) => { observed = { url, headers: init.headers, signal: init.signal }; return ok({ status: 'success' }); };
    const client = new GigapipeClient({ baseUrl: 'http://localhost', auth: { type: 'basic', username: 'u', password: 'p' } });
    const reader = client.loki.createReader({});
    const ctl = new AbortController();
    await reader.query('{job="x"}', { signal: ctl.signal, orgId: 'tenant-a' });
    assert.equal(observed.headers['X-Scope-OrgID'], 'tenant-a');
    assert.ok(observed.signal instanceof AbortSignal);
  });

  it('reader.queryRange respects opts.timeoutMs', async () => {
    let observed;
    globalThis.fetch = async (url, init) => { observed = init; return ok({ status: 'success' }); };
    const client = new GigapipeClient({ baseUrl: 'http://localhost', auth: { type: 'basic', username: 'u', password: 'p' } });
    const reader = client.loki.createReader({ orgId: 'tenant-r' });
    await reader.queryRange('{job="x"}', 0, 1, { limit: 10 }, { timeoutMs: 100 });
    assert.ok(observed.signal instanceof AbortSignal);
  });

  it('push accepts opts.signal', async () => {
    let observed;
    globalThis.fetch = async (url, init) => { observed = init; return ok({ status: 'success' }); };
    const client = new GigapipeClient({ baseUrl: 'http://localhost', auth: { type: 'basic', username: 'u', password: 'p' } });
    const stream = client.createStream({ job: 'x' });
    stream.addEntry('hello');
    const ctl = new AbortController();
    await client.loki.push([stream], { orgId: 'tenant-z', signal: ctl.signal });
    assert.equal(observed.headers['X-Scope-OrgID'], 'tenant-z');
  });

  it('reader.labels supports opts (orgId)', async () => {
    let observed;
    globalThis.fetch = async (url, init) => { observed = init; return ok({ data: [] }); };
    const client = new GigapipeClient({ baseUrl: 'http://localhost', auth: { type: 'basic', username: 'u', password: 'p' } });
    const reader = client.loki.createReader({});
    await reader.labels({}, { orgId: 'tenant-a' });
    assert.equal(observed.headers['X-Scope-OrgID'], 'tenant-a');
  });

  it('reader.labelValues supports opts', async () => {
    let observed;
    globalThis.fetch = async (url, init) => { observed = init; return ok({ data: [] }); };
    const client = new GigapipeClient({ baseUrl: 'http://localhost', auth: { type: 'basic', username: 'u', password: 'p' } });
    const reader = client.loki.createReader({});
    await reader.labelValues('job', {}, { orgId: 'tenant-b' });
    assert.equal(observed.headers['X-Scope-OrgID'], 'tenant-b');
  });

  it('reader.series supports opts', async () => {
    let observed;
    globalThis.fetch = async (url, init) => { observed = init; return ok({ data: [] }); };
    const client = new GigapipeClient({ baseUrl: 'http://localhost', auth: { type: 'basic', username: 'u', password: 'p' } });
    const reader = client.loki.createReader({});
    await reader.series('{job="x"}', {}, { orgId: 'tenant-c' });
    assert.equal(observed.headers['X-Scope-OrgID'], 'tenant-c');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/loki-opts.test.js`
Expected: FAIL — current `Read` methods do not accept `opts`.

- [ ] **Step 3: Implement**

In `src/clients/loki.js`, modify each `Read` method to take a final `opts` argument and forward it to `this.service.request`:

```javascript
  async query(query, queryOptions = {}, opts = {}) {
    if (!query) throw new GigapipeError('Query parameter is required');
    const params = new URLSearchParams({ query });
    if (queryOptions.limit) params.append('limit', queryOptions.limit);
    if (queryOptions.start) params.append('start', queryOptions.start);
    if (queryOptions.end) params.append('end', queryOptions.end);

    const result = await this.service.request(`/loki/api/v1/query?${params.toString()}`, {
      method: 'GET',
      headers: this.headers(opts),
      ...this.#callOpts(opts)
    });

    if (queryOptions.parse) return Loki.parseLogs(result);
    return result;
  }

  async queryRange(query, start, end, queryOptions = {}, opts = {}) {
    if (!query) throw new GigapipeError('Query parameter is required');
    if (!start || !end) throw new GigapipeError('Start and end timestamps are required');
    const params = new URLSearchParams({ query, start, end });
    if (queryOptions.step)  params.append('step',  queryOptions.step);
    if (queryOptions.limit) params.append('limit', queryOptions.limit);

    const result = await this.service.request(`/loki/api/v1/query_range?${params.toString()}`, {
      method: 'GET',
      headers: this.headers(opts),
      ...this.#callOpts(opts)
    });
    if (queryOptions.parse) return Loki.parseLogs(result);
    return result;
  }

  async labels(queryOptions = {}, opts = {}) {
    const params = new URLSearchParams();
    if (queryOptions.start) params.append('start', queryOptions.start);
    if (queryOptions.end)   params.append('end',   queryOptions.end);
    const qs = params.toString();
    return this.service.request(`/loki/api/v1/labels${qs ? `?${qs}` : ''}`, {
      method: 'GET',
      headers: this.headers(opts),
      ...this.#callOpts(opts)
    });
  }

  async labelValues(labelName, queryOptions = {}, opts = {}) {
    if (!labelName) throw new GigapipeError('Label name parameter is required');
    const params = new URLSearchParams();
    if (queryOptions.start) params.append('start', queryOptions.start);
    if (queryOptions.end)   params.append('end',   queryOptions.end);
    const qs = params.toString();
    return this.service.request(`/loki/api/v1/label/${labelName}/values${qs ? `?${qs}` : ''}`, {
      method: 'GET',
      headers: this.headers(opts),
      ...this.#callOpts(opts)
    });
  }

  async series(match, queryOptions = {}, opts = {}) {
    if (!match) throw new GigapipeError('Match parameter is required');
    const params = new URLSearchParams();
    if (queryOptions.start) params.append('start', queryOptions.start);
    if (queryOptions.end)   params.append('end',   queryOptions.end);
    if (typeof match === 'string') params.append('match[]', match);
    else if (Array.isArray(match)) match.forEach(m => params.append('match[]', m));
    else throw new GigapipeError('Match must be a string or array of strings');

    return this.service.request(`/loki/api/v1/series?${params.toString()}`, {
      method: 'GET',
      headers: this.headers(opts),
      ...this.#callOpts(opts)
    });
  }
```

Replace the `headers()` method with one that merges instance options + per-call opts:

```javascript
  headers(opts = {}) {
    const headers = {};
    const orgId = opts.orgId || (this.options && this.options.orgId);
    if (orgId) headers['X-Scope-OrgID'] = orgId;
    return headers;
  }
```

Add the helper:

```javascript
  #callOpts(opts) {
    const { signal, timeoutMs, retry } = opts || {};
    const out = {};
    if (signal !== undefined)    out.signal = signal;
    if (timeoutMs !== undefined) out.timeoutMs = timeoutMs;
    if (retry !== undefined)     out.retry = retry;
    return out;
  }
```

For the outer `Loki` class, modify `push`:

```javascript
  async push(streams, options = {}) {
    let payload = { streams: [] };
    if (!Array.isArray(streams) || !streams.every(s => {
      if (s instanceof Stream) {
        if (s.entries.length) payload.streams.push(s.collect());
        return s;
      }
    })) throw new GigapipeError('Streams must be an array of Stream instances');

    const headers = this.headers(options);
    const { signal, timeoutMs, retry, orgId } = options;
    try {
      const response = await this.service.request('/loki/api/v1/push', {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        ...(signal !== undefined ? { signal } : {}),
        ...(timeoutMs !== undefined ? { timeoutMs } : {}),
        ...(retry !== undefined ? { retry } : {}),
        ...(orgId !== undefined ? { orgId } : {})
      });
      streams.forEach(s => s.confirm());
      return response;
    } catch (error) {
      streams.forEach(s => s.undo());
      if (error instanceof GigapipeError) throw error;
      throw new GigapipeError(`Loki push failed: ${error.message}`, error.statusCode);
    }
  }
```

- [ ] **Step 4: Run tests**

Run: `node --test test/loki-opts.test.js && npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/clients/loki.js test/loki-opts.test.js
git commit -m "feat: plumb per-call opts (signal/timeoutMs/retry/orgId) through Loki push and reader"
```

---

## Task 11: Plumb `opts` through Prometheus push and reader

**Why:** Same as Task 10, applied to Prometheus.

**Files:**
- Modify: `src/clients/prometheus.js`
- Create: `test/prom-opts.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
// test/prom-opts.test.js
const { describe, it, afterEach } = require('node:test');
const assert = require('node:assert');
const { GigapipeClient } = require('../src/index');

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

function ok(body = {}) { return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } }); }

describe('Prometheus — opts plumbing', () => {
  it('reader.query forwards orgId', async () => {
    let observed;
    globalThis.fetch = async (url, init) => { observed = init.headers; return ok({}); };
    const client = new GigapipeClient({ baseUrl: 'http://localhost', auth: { type: 'basic', username: 'u', password: 'p' } });
    const reader = client.prom.createReader({});
    await reader.query('up', { orgId: 'tenant-a' });
    assert.equal(observed['X-Scope-OrgID'], 'tenant-a');
  });

  it('reader.queryRange forwards opts', async () => {
    let observed;
    globalThis.fetch = async (url, init) => { observed = init; return ok({}); };
    const client = new GigapipeClient({ baseUrl: 'http://localhost', auth: { type: 'basic', username: 'u', password: 'p' } });
    const reader = client.prom.createReader({});
    await reader.queryRange('up', 0, 1, '15s', { orgId: 'tenant-b', timeoutMs: 250 });
    assert.equal(observed.headers['X-Scope-OrgID'], 'tenant-b');
  });

  it('reader.labels/labelValues/series/rules accept opts', async () => {
    let observed;
    globalThis.fetch = async (url, init) => { observed = init.headers; return ok({}); };
    const client = new GigapipeClient({ baseUrl: 'http://localhost', auth: { type: 'basic', username: 'u', password: 'p' } });
    const reader = client.prom.createReader({});
    await reader.labels({ orgId: 't1' });        assert.equal(observed['X-Scope-OrgID'], 't1');
    await reader.labelValues('x', { orgId: 't2' }); assert.equal(observed['X-Scope-OrgID'], 't2');
    await reader.series(['{a="b"}'], 0, 1, { orgId: 't3' }); assert.equal(observed['X-Scope-OrgID'], 't3');
    await reader.rules({ orgId: 't4' });         assert.equal(observed['X-Scope-OrgID'], 't4');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/prom-opts.test.js`
Expected: FAIL.

- [ ] **Step 3: Implement**

In `src/clients/prometheus.js`, modify each `Read` method to accept a trailing `opts = {}` and forward to `this.service.request`. Use the same `#callOpts(opts)` helper pattern as in Task 10. Update `headers(opts)` to read `orgId` from either `this.options.orgId` or `opts.orgId`:

```javascript
class Read {
  constructor(service, options) { this.service = service; this.options = options || {}; }

  async query(query, opts = {}) {
    return this.service.request('/api/v1/query', {
      method: 'POST',
      headers: this.headers(opts),
      body: new URLSearchParams({ query }),
      ...this.#callOpts(opts)
    });
  }

  async queryRange(query, start, end, step, opts = {}) {
    return this.service.request('/api/v1/query_range', {
      method: 'POST',
      headers: this.headers(opts),
      body: new URLSearchParams({ query, start, end, step }),
      ...this.#callOpts(opts)
    });
  }

  async labels(opts = {}) {
    return this.service.request('/api/v1/labels', { method: 'GET', headers: this.headers(opts), ...this.#callOpts(opts) });
  }

  async labelValues(labelName, opts = {}) {
    return this.service.request(`/api/v1/label/${labelName}/values`, { method: 'GET', headers: this.headers(opts), ...this.#callOpts(opts) });
  }

  async series(match, start, end, opts = {}) {
    if (!match) throw new GigapipeError('match parameter is required');
    if (typeof match === 'string') match = [match];
    const params = new URLSearchParams({ start, end });
    match.forEach(m => params.append('match[]', m));
    return this.service.request('/api/v1/series', { method: 'POST', headers: this.headers(opts), body: params, ...this.#callOpts(opts) });
  }

  async rules(opts = {}) {
    return this.service.request('/api/v1/rules', { method: 'GET', headers: this.headers(opts), ...this.#callOpts(opts) });
  }

  headers(opts = {}) {
    const headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
    const orgId = opts.orgId || this.options.orgId;
    if (orgId) headers['X-Scope-OrgID'] = orgId;
    return headers;
  }

  #callOpts(opts) {
    const { signal, timeoutMs, retry } = opts || {};
    const out = {};
    if (signal !== undefined)    out.signal = signal;
    if (timeoutMs !== undefined) out.timeoutMs = timeoutMs;
    if (retry !== undefined)     out.retry = retry;
    return out;
  }
}
```

For the outer `Prometheus` class, modify `push(metrics, options)` to forward `signal/timeoutMs/retry/orgId` from `options` to `this.service.request` (mirror the loki push change in Task 10).

- [ ] **Step 4: Run tests**

Run: `node --test test/prom-opts.test.js && npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/clients/prometheus.js test/prom-opts.test.js
git commit -m "feat: plumb per-call opts through Prometheus push and reader"
```

---

## Task 12: Tempo — add `searchTags`, `searchTagValues`, `getTrace`; plumb opts everywhere

**Why:** P1 #6 — full tempo surface from the source spec, plus opts plumbing on all methods (existing and new).

**Files:**
- Modify: `src/clients/tempo.js`
- Create: `test/tempo.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
// test/tempo.test.js
const { describe, it, afterEach } = require('node:test');
const assert = require('node:assert');
const { GigapipeClient } = require('../src/index');

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

function ok(body = {}) { return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } }); }

describe('TempoClient v1.1', () => {
  it('search forwards opts', async () => {
    let observed;
    globalThis.fetch = async (url, init) => { observed = init.headers; return ok({}); };
    const client = new GigapipeClient({ baseUrl: 'http://localhost', auth: { type: 'basic', username: 'u', password: 'p' } });
    await client.tempo.search('q=foo', { orgId: 'tenant-x' });
    assert.equal(observed['X-Scope-OrgID'], 'tenant-x');
  });

  it('searchTags hits /api/search/tags with optional scope', async () => {
    const urls = [];
    globalThis.fetch = async (url) => { urls.push(url); return ok({ tagNames: [] }); };
    const client = new GigapipeClient({ baseUrl: 'http://localhost', auth: { type: 'basic', username: 'u', password: 'p' } });
    await client.tempo.searchTags();
    assert.ok(urls[0].endsWith('/api/search/tags'), `got ${urls[0]}`);
    await client.tempo.searchTags('span');
    assert.ok(urls[1].includes('/api/search/tags?scope=span'), `got ${urls[1]}`);
  });

  it('searchTagValues hits /api/search/tag/{tag}/values', async () => {
    let observedUrl;
    globalThis.fetch = async (url) => { observedUrl = url; return ok({ tagValues: [] }); };
    const client = new GigapipeClient({ baseUrl: 'http://localhost', auth: { type: 'basic', username: 'u', password: 'p' } });
    await client.tempo.searchTagValues('service.name');
    assert.ok(observedUrl.endsWith('/api/search/tag/service.name/values'), `got ${observedUrl}`);
  });

  it('getTrace is an alias of getTraceSpansJson but on /api/traces/{id}', async () => {
    let observedUrl;
    globalThis.fetch = async (url) => { observedUrl = url; return ok({ batches: [] }); };
    const client = new GigapipeClient({ baseUrl: 'http://localhost', auth: { type: 'basic', username: 'u', password: 'p' } });
    await client.tempo.getTrace('abc-123');
    assert.ok(observedUrl.endsWith('/api/traces/abc-123'), `got ${observedUrl}`);
  });

  it('getTrace forwards opts.orgId', async () => {
    let observed;
    globalThis.fetch = async (url, init) => { observed = init.headers; return ok({}); };
    const client = new GigapipeClient({ baseUrl: 'http://localhost', auth: { type: 'basic', username: 'u', password: 'p' } });
    await client.tempo.getTrace('abc-123', { orgId: 'tenant-q' });
    assert.equal(observed['X-Scope-OrgID'], 'tenant-q');
  });

  it('searchTagValuesV2 still works (back-compat)', async () => {
    let observedUrl;
    globalThis.fetch = async (url) => { observedUrl = url; return ok({}); };
    const client = new GigapipeClient({ baseUrl: 'http://localhost', auth: { type: 'basic', username: 'u', password: 'p' } });
    await client.tempo.searchTagValuesV2('http.status_code', 'q=foo');
    assert.ok(observedUrl.includes('/api/v2/search/tag/http.status_code/values?q=foo'), `got ${observedUrl}`);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/tempo.test.js`
Expected: FAIL — `searchTags`/`searchTagValues`/`getTrace` not defined.

- [ ] **Step 3: Implement**

Replace `src/clients/tempo.js` with:

```javascript
const { GigapipeError } = require('../types');

class TempoClient {
  constructor(service) {
    this.service = service;
  }

  async search(searchParams, opts = {}) {
    const qs = (searchParams instanceof URLSearchParams) ? searchParams.toString() : (searchParams || '');
    return this.service.request(`/api/search${qs ? '?' + qs : ''}`, {
      method: 'GET',
      headers: this.headers(opts),
      ...this.#callOpts(opts)
    });
  }

  async searchTags(scope, opts = {}) {
    const qs = scope ? `?scope=${encodeURIComponent(scope)}` : '';
    return this.service.request(`/api/search/tags${qs}`, {
      method: 'GET',
      headers: this.headers(opts),
      ...this.#callOpts(opts)
    });
  }

  async searchTagValues(tag, opts = {}) {
    if (!tag) throw new GigapipeError('Tag parameter is required');
    return this.service.request(`/api/search/tag/${encodeURIComponent(tag)}/values`, {
      method: 'GET',
      headers: this.headers(opts),
      ...this.#callOpts(opts)
    });
  }

  async searchTagValuesV2(tagName, searchParams, opts = {}) {
    const qs = searchParams ? `?${searchParams}` : '';
    return this.service.request(`/api/v2/search/tag/${encodeURIComponent(tagName)}/values${qs}`, {
      method: 'GET',
      headers: this.headers(opts),
      ...this.#callOpts(opts)
    });
  }

  async getTrace(traceId, opts = {}) {
    if (!traceId) throw new GigapipeError('traceId parameter is required');
    return this.service.request(`/api/traces/${encodeURIComponent(traceId)}`, {
      method: 'GET',
      headers: this.headers(opts),
      ...this.#callOpts(opts)
    });
  }

  async getTraceSpansJson(traceID, opts = {}) {
    return this.service.request(`/api/traces/${encodeURIComponent(traceID)}/json`, {
      method: 'GET',
      headers: this.headers(opts),
      ...this.#callOpts(opts)
    });
  }

  headers(opts = {}) {
    const headers = { 'Content-Type': 'application/json', 'Accept': 'application/json' };
    if (opts.orgId) headers['X-Scope-OrgID'] = opts.orgId;
    return headers;
  }

  #callOpts(opts) {
    const { signal, timeoutMs, retry } = opts || {};
    const out = {};
    if (signal !== undefined)    out.signal = signal;
    if (timeoutMs !== undefined) out.timeoutMs = timeoutMs;
    if (retry !== undefined)     out.retry = retry;
    return out;
  }
}

module.exports = TempoClient;
```

- [ ] **Step 4: Run tests**

Run: `node --test test/tempo.test.js && npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/clients/tempo.js test/tempo.test.js
git commit -m "feat: align Tempo client with v1.1 (searchTags, searchTagValues, getTrace, opts)"
```

---

## Task 13: Export the new error classes from `src/index.js`

**Why:** Source spec — consumers must be able to `require('gigapipe-client').GigapipeAbortedError`.

**Files:**
- Modify: `src/index.js`
- Create: `test/exports.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
// test/exports.test.js
const { describe, it } = require('node:test');
const assert = require('node:assert');
const pkg = require('../src/index');

describe('package exports', () => {
  it('exports GigapipeClient, Stream, Metric, Collector', () => {
    assert.equal(typeof pkg.GigapipeClient, 'function');
    assert.equal(typeof pkg.Stream, 'function');
    assert.equal(typeof pkg.Metric, 'function');
    assert.equal(typeof pkg.Collector, 'function');
  });

  it('exports the typed errors', () => {
    assert.equal(typeof pkg.GigapipeError, 'function');
    assert.equal(typeof pkg.GigapipeAbortedError, 'function');
    assert.equal(typeof pkg.GigapipeTimeoutError, 'function');
    assert.equal(typeof pkg.GigapipeResponse, 'function');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/exports.test.js`
Expected: FAIL — error classes not in module.exports.

- [ ] **Step 3: Implement**

At the bottom of `src/index.js`, replace `module.exports` with:

```javascript
const { GigapipeError, GigapipeResponse, GigapipeAbortedError, GigapipeTimeoutError } = require('./types');

module.exports = {
  GigapipeClient,
  Stream,
  Metric,
  Collector,
  GigapipeError,
  GigapipeResponse,
  GigapipeAbortedError,
  GigapipeTimeoutError
};
```

- [ ] **Step 4: Run tests**

Run: `node --test test/exports.test.js && npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/index.js test/exports.test.js
git commit -m "feat: export typed errors from package entrypoint"
```

---

## Task 14: Hand-written `index.d.ts`

**Why:** P0 #2 — type declarations published with the package.

**Files:**
- Create: `index.d.ts`
- Create: `tsconfig.json`
- Modify: `package.json` — `types`, `files`, devDep on TypeScript, scripts.

- [ ] **Step 1: Add the declaration file**

```typescript
// index.d.ts

declare module 'gigapipe-client' {
  // === Core types ===

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

  export type GigapipeAuth =
    | { type: 'basic'; username: string; password: string }
    | { type: 'bearer'; token: string | (() => Promise<string>) }
    | { type: 'custom'; headers: Record<string, string> | (() => Promise<Record<string, string>>) }
    | { username: string; password: string }; // legacy

  export interface GigapipeClientOptions {
    baseUrl?: string;
    auth?: GigapipeAuth;
    headers?: Record<string, string>;
    timeout?: number;
    retry?: RetryOptions;
    defaultOrgId?: string;
  }

  // === Errors ===
  export class GigapipeError extends Error {
    constructor(message: string, statusCode?: number | null, cause?: unknown, path?: string);
    statusCode: number | null;
    cause: unknown;
    path: string | undefined;
  }
  export class GigapipeAbortedError extends GigapipeError { reason?: unknown; }
  export class GigapipeTimeoutError extends GigapipeError { elapsedMs: number; }

  // === Response envelope ===
  export class GigapipeResponse<T = unknown> {
    response: T;
    status: number;
    headers: Headers;
    path: string;
    readonly isSuccess: boolean;
    readonly getStatus: number;
    readonly getHeaders: Record<string, string>;
    getData(): T;
    getHeader(name: string): string | null;
    toString(): string;
  }

  // === Loki ===
  export interface LokiQueryOptions {
    limit?: number;
    start?: number | string;
    end?: number | string;
    step?: number | string;
    parse?: boolean;
  }

  export class Stream {
    constructor(labels: Record<string, string>);
    labels: Record<string, string>;
    entries: Array<[string, string]>;
    addEntry(message: string, timestampNs?: string | number): this;
    addListener(callback: (...args: any[]) => void): this;
    confirm(): void;
    undo(): void;
    collect(): { stream: Record<string, string>; values: Array<[string, string]> };
  }

  export interface LokiReader {
    query(query: string, queryOptions?: LokiQueryOptions, opts?: ReadOpts): Promise<GigapipeResponse>;
    queryRange(query: string, start: number | string, end: number | string, queryOptions?: LokiQueryOptions, opts?: ReadOpts): Promise<GigapipeResponse>;
    labels(queryOptions?: { start?: number | string; end?: number | string }, opts?: ReadOpts): Promise<GigapipeResponse>;
    labelValues(labelName: string, queryOptions?: { start?: number | string; end?: number | string }, opts?: ReadOpts): Promise<GigapipeResponse>;
    series(match: string | string[], queryOptions?: { start?: number | string; end?: number | string }, opts?: ReadOpts): Promise<GigapipeResponse>;
  }

  export interface LokiClient {
    push(streams: Stream[], opts?: ReadOpts): Promise<GigapipeResponse>;
    createReader(options?: { orgId?: string }): LokiReader;
    parseLogs(result: GigapipeResponse): Array<{ timestamp: string; timestampMs: number; date: Date; dateISO: string; message: unknown; labels: Record<string, string> }>;
  }

  // === Prometheus ===
  export class Metric {
    constructor(name: string, labels?: Record<string, string>);
    name: string;
    labels: Record<string, string>;
    samples: Array<[number, number]>;
    addSample(value: number, timestampMs?: number): this;
    confirm(): void;
    undo(): void;
    collect(): { labels: Array<{ name: string; value: string }>; samples: Array<{ value: number; timestamp: number }> };
  }

  export interface PromReader {
    query(query: string, opts?: ReadOpts): Promise<GigapipeResponse>;
    queryRange(query: string, start: number | string, end: number | string, step: string, opts?: ReadOpts): Promise<GigapipeResponse>;
    labels(opts?: ReadOpts): Promise<GigapipeResponse>;
    labelValues(labelName: string, opts?: ReadOpts): Promise<GigapipeResponse>;
    series(match: string | string[], start: number | string, end: number | string, opts?: ReadOpts): Promise<GigapipeResponse>;
    rules(opts?: ReadOpts): Promise<GigapipeResponse>;
  }

  export interface PromClient {
    push(metrics: Metric[], opts?: ReadOpts): Promise<GigapipeResponse>;
    createReader(options?: { orgId?: string }): PromReader;
  }

  // === Tempo ===
  export interface TempoClient {
    search(searchParams?: string | URLSearchParams, opts?: ReadOpts): Promise<GigapipeResponse>;
    searchTags(scope?: 'span' | 'resource' | 'intrinsic', opts?: ReadOpts): Promise<GigapipeResponse>;
    searchTagValues(tag: string, opts?: ReadOpts): Promise<GigapipeResponse>;
    searchTagValuesV2(tagName: string, searchParams?: string, opts?: ReadOpts): Promise<GigapipeResponse>;
    getTrace(traceId: string, opts?: ReadOpts): Promise<GigapipeResponse>;
    getTraceSpansJson(traceID: string, opts?: ReadOpts): Promise<GigapipeResponse>;
  }

  // === Collector ===
  export class Collector {
    constructor(client: GigapipeClient, config?: { maxBulkSize?: number; maxTimeout?: number });
    add(item: Stream | Metric): void;
    flush(): Promise<void>;
  }

  // === Client ===
  export class GigapipeClient {
    constructor(config: GigapipeClientOptions);
    loki: LokiClient;
    prom: PromClient;
    tempo: TempoClient;
    createCollector(config?: { maxBulkSize?: number; maxTimeout?: number }): Collector;
    createStream(labels: Record<string, string>): Stream;
    createMetric(args: { name: string; labels?: Record<string, string> }): Metric;
  }
}
```

- [ ] **Step 2: Add a minimal `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "moduleResolution": "node",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "noEmit": true
  },
  "include": ["index.d.ts", "test/types/**/*.ts"]
}
```

- [ ] **Step 3: Update `package.json`**

```json
{
  "name": "gigapipe-client",
  "version": "1.1.0",
  "description": "A client library for interacting with Gigapipe, a high-performance observability platform.",
  "main": "src/index.js",
  "types": "index.d.ts",
  "files": ["src", "index.d.ts"],
  "scripts": {
    "test": "node --test test/*.test.js",
    "test:watch": "node --test --watch test/*.test.js",
    "test:coverage": "node --test --experimental-test-coverage test/*.test.js",
    "test:types": "tsc --noEmit -p tsconfig.json"
  },
  "author": "tzachiSh",
  "license": "MIT",
  "dependencies": {
    "lru-cache": "^11.0.1",
    "protobufjs": "^7.3.2",
    "snappy": "^7.2.2"
  },
  "devDependencies": {
    "typescript": "^5.4.0"
  },
  "repository": { "type": "git", "url": "https://github.com/gigapipe/gigapipe-client.git" },
  "keywords": ["gigapipe", "client", "observability", "monitoring", "logging", "metrics", "telemetry", "analytics", "loki", "prometheus", "tempo", "tracing"],
  "bugs": { "url": "https://github.com/gigapipe/gigapipe-client/issues" },
  "homepage": "https://gigapipe.com",
  "engines": { "node": ">=18.0.0" }
}
```

- [ ] **Step 4: Install TypeScript devDep**

Run: `npm install --save-dev typescript@^5.4.0`
Expected: `typescript` installed.

- [ ] **Step 5: Verify the type smoke compiles (skip until Task 15 supplies the consumer file)**

This task ends without an executable check; Task 15 adds the consumer-smoke file and runs `tsc`.

- [ ] **Step 6: Commit**

```bash
git add index.d.ts tsconfig.json package.json package-lock.json
git commit -m "feat: add hand-written index.d.ts and tsc declaration pipeline"
```

---

## Task 15: Add a consumer type-smoke that compiles under `--strict`

**Why:** P0 #2 acceptance — `tsc --noEmit --strict` passes from a consumer project.

**Files:**
- Create: `test/types/consumer-smoke.ts`

- [ ] **Step 1: Add the smoke file**

```typescript
// test/types/consumer-smoke.ts
import {
  GigapipeClient,
  GigapipeAbortedError,
  GigapipeTimeoutError,
  GigapipeError,
  GigapipeResponse,
  Stream,
  Metric
} from 'gigapipe-client';

async function smoke(): Promise<void> {
  const ctl = new AbortController();

  // Auth shapes
  const c1 = new GigapipeClient({
    baseUrl: 'http://localhost:3100',
    auth: { type: 'basic', username: 'u', password: 'p' },
    defaultOrgId: 'tenant-a',
    retry: { attempts: 5, baseDelayMs: 100, maxDelayMs: 2000 }
  });
  const c2 = new GigapipeClient({ auth: { type: 'bearer', token: async () => 'tok' } });
  const c3 = new GigapipeClient({ auth: { type: 'custom', headers: { 'X-Api-Key': 'abc' } } });
  const c4 = new GigapipeClient({ auth: { type: 'custom', headers: async () => ({ 'X-Api-Key': 'abc' }) } });
  const c5 = new GigapipeClient({}); // unauthenticated allowed

  // Loki write
  const stream: Stream = c1.createStream({ job: 'api' });
  await c1.loki.push([stream], { orgId: 'tenant-a', signal: ctl.signal, timeoutMs: 30_000 });

  // Loki read
  const reader = c1.loki.createReader({ orgId: 'tenant-a' });
  const r1: GigapipeResponse = await reader.query('{job="api"}', { limit: 100 }, { signal: ctl.signal });
  const r2 = await reader.queryRange('{job="api"}', new Date(), new Date(), { step: '1m' }, { timeoutMs: 60_000 });
  await reader.labels({}, { signal: ctl.signal });
  await reader.labelValues('job');
  await reader.series('{job="api"}');

  // Prometheus
  const metric: Metric = c1.createMetric({ name: 'http_requests' });
  await c1.prom.push([metric], { orgId: 'tenant-a' });
  await c1.prom.createReader({}).queryRange('up', 0, 1, '15s', { signal: ctl.signal });
  await c1.prom.createReader({}).rules({ orgId: 'tenant-a' });

  // Tempo
  await c1.tempo.search('q=foo', { signal: ctl.signal });
  await c1.tempo.searchTags('span');
  await c1.tempo.searchTagValues('service.name');
  await c1.tempo.getTrace('abc-123', { orgId: 'tenant-a' });

  // Errors
  try {
    await reader.query('{job="api"}', {}, { signal: ctl.signal });
  } catch (e) {
    if (e instanceof GigapipeAbortedError) console.error('aborted', e.reason);
    else if (e instanceof GigapipeTimeoutError) console.error('timeout', e.elapsedMs);
    else if (e instanceof GigapipeError) console.error('error', e.statusCode);
  }
}

void smoke();
```

- [ ] **Step 2: Make the import resolve**

Add a `paths` mapping so the bare specifier `gigapipe-client` resolves to the local `index.d.ts`:

```json
// tsconfig.json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "moduleResolution": "node",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "noEmit": true,
    "baseUrl": ".",
    "paths": { "gigapipe-client": ["./index.d.ts"] }
  },
  "include": ["index.d.ts", "test/types/**/*.ts"]
}
```

- [ ] **Step 3: Run the type smoke**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: PASS — no errors.

- [ ] **Step 4: Run full suite to ensure no regression**

Run: `npm test && npm run test:types`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add test/types/consumer-smoke.ts tsconfig.json
git commit -m "test: add consumer type-smoke that compiles under --strict"
```

---

## Task 16: Update `example/read.js` and add `example/loki-read.js` for runtime smoke

**Why:** Source spec acceptance — manual runtime smoke against a live qryn (env-var driven).

**Files:**
- Create: `example/loki-read.js`
- Modify: `example/read.js` (no behavior change — confirm it still runs against rebranding's prom reader)

- [ ] **Step 1: Add the loki read example**

```javascript
// example/loki-read.js

/**
 * Runtime smoke for the Loki reader. Driven by env vars:
 *   GIGAPIPE_URL=http://localhost:3100 \
 *   GIGAPIPE_USER=user \
 *   GIGAPIPE_PASS=pass \
 *   GIGAPIPE_ORG=tenant-a \
 *   node example/loki-read.js
 */
const { GigapipeClient } = require('../src');

(async () => {
  const baseUrl = process.env.GIGAPIPE_URL || 'http://localhost:3100';
  const auth = process.env.GIGAPIPE_USER
    ? { type: 'basic', username: process.env.GIGAPIPE_USER, password: process.env.GIGAPIPE_PASS }
    : undefined;
  const orgId = process.env.GIGAPIPE_ORG;

  const client = new GigapipeClient({ baseUrl, auth, defaultOrgId: orgId, timeout: 30_000 });
  const reader = client.loki.createReader({});

  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort('demo-timeout'), 25_000);
  try {
    const labels = await reader.labels({}, { signal: ctl.signal });
    console.log('labels:', JSON.stringify(labels.response?.data?.slice?.(0, 10) ?? labels.response, null, 2));

    const end = Date.now() * 1_000_000;
    const start = (Date.now() - 5 * 60 * 1000) * 1_000_000;
    const range = await reader.queryRange('{job=~".+"}', String(start), String(end), { limit: 5 }, { signal: ctl.signal });
    console.log('range[0..1]:', JSON.stringify(range.response?.data?.result?.slice?.(0, 1), null, 2));
  } finally {
    clearTimeout(timer);
  }
})().catch(err => { console.error(err); process.exit(1); });
```

- [ ] **Step 2: Run static check**

Run: `node -e "require('./example/loki-read.js')" 2>&1 | head -20`
Expected: file parses without syntax error (will fail to connect — OK, we're not running it for real).

- [ ] **Step 3: Commit**

```bash
git add example/loki-read.js
git commit -m "docs: add runtime smoke example for Loki reader"
```

---

## Task 17: Add `example/tempo.js` runtime smoke

**Files:**
- Create: `example/tempo.js`

- [ ] **Step 1: Add the example**

```javascript
// example/tempo.js
const { GigapipeClient } = require('../src');

(async () => {
  const client = new GigapipeClient({
    baseUrl: process.env.GIGAPIPE_URL || 'http://localhost:3100',
    auth: process.env.GIGAPIPE_USER
      ? { type: 'basic', username: process.env.GIGAPIPE_USER, password: process.env.GIGAPIPE_PASS }
      : undefined,
    defaultOrgId: process.env.GIGAPIPE_ORG
  });

  const tags = await client.tempo.searchTags('span');
  console.log('span tags:', tags.response);

  if (process.env.TEMPO_TRACE_ID) {
    const trace = await client.tempo.getTrace(process.env.TEMPO_TRACE_ID);
    console.log('trace:', JSON.stringify(trace.response, null, 2));
  }
})().catch(err => { console.error(err); process.exit(1); });
```

- [ ] **Step 2: Static check**

Run: `node -e "require('./example/tempo.js')" 2>&1 | head -10`
Expected: parses (network error is fine).

- [ ] **Step 3: Commit**

```bash
git add example/tempo.js
git commit -m "docs: add runtime smoke example for Tempo additions"
```

---

## Task 18: Update `README.md` with new auth/retry/abort/ReadOpts/Tempo surface

**Why:** Source spec acceptance — error and auth shapes documented for consumers.

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Append a "v1.1 surface" section**

Append the following block at the end of `README.md` (do not rewrite the file; preserve every existing section):

```markdown
## v1.1.0 surface

### New `auth` shapes (legacy still accepted)

```js
new GigapipeClient({
  baseUrl: 'http://localhost:3100',
  auth: { type: 'basic',  username: 'u', password: 'p' },
  // or:
  auth: { type: 'bearer', token: 'static-token' },
  auth: { type: 'bearer', token: async () => fetchTokenFromVault() },
  auth: { type: 'custom', headers: { 'X-Api-Key': 'abc' } },
  auth: { type: 'custom', headers: async () => ({ 'X-Api-Key': await rotateKey() }) }
});
```

The legacy `auth: { username, password }` shape is still accepted but emits a `DeprecationWarning` (code `GIGAPIPE_AUTH_LEGACY`). It will be removed in 2.0.0.

### Per-call `ReadOpts`

Every read and write method now accepts an `opts: { signal?, timeoutMs?, retry?, orgId? }` last argument:

```js
const ctl = new AbortController();
await client.loki.createReader({}).queryRange(query, start, end, { limit: 100 }, {
  signal: ctl.signal,
  timeoutMs: 30_000,
  orgId: 'tenant-a',
  retry: { attempts: 3, baseDelayMs: 200, maxDelayMs: 5000 }
});
```

### Retry / backoff

Retries on network errors (`ECONNREFUSED`, `ECONNRESET`, `ETIMEDOUT`, `EAI_AGAIN`) and HTTP `408`, `429`, `502`, `503`, `504`. Honors `Retry-After` (delta-seconds OR HTTP-date). Configurable per-call via `opts.retry` or per-instance via `new GigapipeClient({ retry })`. Defaults: `{ attempts: 3, baseDelayMs: 200, maxDelayMs: 5000 }`.

Each attempt receives the full `timeoutMs` budget — retries do not double-count against the caller's deadline. The caller-supplied `signal` aborts the entire chain immediately.

### Typed errors

```js
const { GigapipeError, GigapipeAbortedError, GigapipeTimeoutError } = require('gigapipe-client');

try {
  await client.loki.createReader({}).query(q, {}, { signal });
} catch (e) {
  if (e instanceof GigapipeAbortedError) {/* user cancelled */}
  else if (e instanceof GigapipeTimeoutError) {/* attempt budget exceeded; e.elapsedMs */}
  else if (e instanceof GigapipeError) {/* HTTP error; e.statusCode, e.cause */}
}
```

### `defaultOrgId`

Set once at the client level and forwarded as `X-Scope-OrgID` on every request. Per-call `opts.orgId` overrides.

```js
new GigapipeClient({ baseUrl, auth, defaultOrgId: 'tenant-a' });
```

### Tempo additions

```js
client.tempo.searchTags('span' | 'resource' | 'intrinsic');
client.tempo.searchTagValues('service.name');
client.tempo.getTrace('abc-123');         // alias of getTraceSpansJson but on /api/traces/{id}
```

### TypeScript

The package ships an `index.d.ts`. `tsc --noEmit --strict` passes from a consumer project.
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: document v1.1.0 surface (auth shapes, retry, abort, loki reader, tempo additions)"
```

---

## Task 19: Bump version to 1.1.0

**Files:**
- Already done in Task 14 (package.json edit). Confirm.

- [ ] **Step 1: Verify**

Run: `node -e "console.log(require('./package.json').version)"`
Expected: `1.1.0`.

If 1.1.0 is not yet present (e.g., Task 14 was skipped or partially applied), edit `package.json`:

```json
"version": "1.1.0"
```

- [ ] **Step 2: Commit (only if a change was made above)**

```bash
git add package.json
git commit -m "chore: bump version 1.0.0 -> 1.1.0"
```

---

## Task 20: Final verification + push

**Files:** none.

- [ ] **Step 1: Run the whole test suite**

Run: `npm test`
Expected: All test files pass; no failures.

- [ ] **Step 2: Run the type smoke**

Run: `npm run test:types`
Expected: PASS — no TypeScript errors.

- [ ] **Step 3: Confirm `require('./src')` still loads cleanly**

Run: `node -e "console.log(Object.keys(require('./src')))"`
Expected output (order may vary): `[ 'GigapipeClient', 'Stream', 'Metric', 'Collector', 'GigapipeError', 'GigapipeResponse', 'GigapipeAbortedError', 'GigapipeTimeoutError' ]`.

- [ ] **Step 4: Check git log**

Run: `git log --oneline origin/rebranding..HEAD`
Expected: ~20 commits, one per task above.

- [ ] **Step 5: Push to voicenter**

Run: `git push -u voicenter rebranding-v1.1`
Expected: branch published.

- [ ] **Step 6: Open the PR**

Run:
```bash
gh pr create \
  --repo metrico/qryn-client \
  --base rebranding \
  --head VoicenterTeam:rebranding-v1.1 \
  --title "v1.1.0: pluggable auth, retry/abort, ReadOpts, Tempo additions, .d.ts" \
  --body "$(cat <<'EOF'
## Summary

Lands the qryn-client v1.1 P0+P1 deliverables on top of `rebranding`. Non-breaking minor release of `gigapipe-client`.

- Pluggable auth: `{ type: 'basic'|'bearer'|'custom', ... }` plus thunk-based bearer/custom for token refresh on every request. Legacy `{username,password}` shape still accepted with a `DeprecationWarning` (code `GIGAPIPE_AUTH_LEGACY`).
- Per-call `ReadOpts` (`signal`, `timeoutMs`, `retry`, `orgId`) plumbed through every Loki/Prom/Tempo read and write.
- Retry loop with exponential backoff + full jitter + `Retry-After` honoring (seconds OR HTTP-date). Defaults `attempts: 3, baseDelayMs: 200, maxDelayMs: 5000`. Per-attempt timeout budget — retries do not double-count against the caller's deadline.
- Typed `GigapipeAbortedError` and `GigapipeTimeoutError` thrown from the HTTP layer (caller-abort vs timeout disambiguated).
- Tempo additions: `searchTags`, `searchTagValues` (v1 path), `getTrace` alias.
- `defaultOrgId` constructor option.
- Hand-written `index.d.ts`; `tsc --noEmit --strict` consumer smoke in CI-runnable form.
- `toNanos` time helper, `anySignal` Node-18 polyfill.

## What rebranding already had (preserved)

- `Gigapipe*` naming, `GigapipeError`, `GigapipeResponse`.
- `Loki.createReader()` with `query/queryRange/labels/labelValues/series` (now opts-aware).
- `Loki.parseLogs` static helper.
- `Prometheus.createReader()` with all six methods (now opts-aware).
- `node:test` harness + 5 baseline tests.
- `Tempo.search/searchTagValuesV2/getTraceSpansJson` (now opts-aware; v2 method retained for back-compat).

No existing public API removed.

## Test plan

- [ ] `npm test` — all unit tests pass (~15+ test files)
- [ ] `npm run test:types` — type smoke compiles under `--strict`
- [ ] `node -e "require('./src')"` — loads cleanly
- [ ] Manual: `node example/loki-read.js` against a local qryn
- [ ] Manual: `node example/tempo.js` against a local qryn

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Expected: PR URL printed.

- [ ] **Step 7: Mark all todos complete**

---

## Self-review checklist (run before handing off)

1. **Spec coverage** — every P0/P1 acceptance item from `docs/refreance/qryn-client-extensions-requirements.md` maps to a task above.
2. **No placeholders** — every step has actual code, exact paths, exact commands.
3. **Type consistency** — `ReadOpts`, `RetryOptions`, `GigapipeAuth`, `GigapipeClientOptions` use identical names everywhere they appear.
4. **Existing tests preserved** — no task deletes or skips the baseline `test/*.test.js` from rebranding.
