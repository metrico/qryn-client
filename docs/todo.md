# TODO — post-audit backlog

Items left after the 2026-05-02 coding-agent readiness audit. Prioritized roughly by ROI.

## High value

- [ ] **Add a test suite.** No tests exist today. Suggested first cut: `node:test` (built-in, no deps), one suite per public class, mock `fetch` via `globalThis.fetch = ...`. Prom remote-write encoding is the most fragile area and should be the first target.
- [ ] **Add a PR-validation workflow.** Mirror the structure of `npm_release.yml`. Should run `node -e "require('./src')"` at minimum, then `npm test` once tests exist. Block merges on failure.
- [ ] **Lock the response shape.** Now that `Http.request()` actually returns response bodies (audit fix B3), publish a `QrynResponse.response` schema for each endpoint in `docs/architecture.md` so consumers stop relying on guesswork.

## Medium value

- [ ] **Refactor `Loki.push` / `Prometheus.push` validators.** Replace the side-effecting `.every()` with a two-pass `filter(s instanceof Stream).filter(s => s.entries.length)`. Functionally identical, much easier to read. See `docs/AUDIT.md` "Code observations".
- [ ] **Drop `Read` class from `prometheus.js`.** It's a separate concern (read path vs. write path) and pollutes `clients/prometheus.js`. Move to `src/clients/prometheus-read.js`.
- [ ] **Add `getData()` deprecation note.** Now that it works (audit fix B2), but the field name `response` is also exposed directly, having two ways to read the body is redundant. Pick one.
- [ ] **Document the `headers` config option** in the README API Reference (the constructor accepts it but it's only mentioned in JSDoc).

## Low value / polish

- [ ] **Generate `.d.ts` from JSDoc** via `tsc --declaration --allowJs --emitDeclarationOnly`. Consumers using TypeScript currently get no IntelliSense.
- [ ] **Add a CHANGELOG.md.** Releases live only on GitHub Releases today.
- [ ] **Adopt Conventional Commits** (project-wide decision; affects PR title bots).
- [ ] **`example/` could use a README** explaining the env-var matrix.

## Unblocked by future qryn changes

- [ ] **Streaming push response (Loki).** Loki supports streamed responses for large pushes; the client always reads the full body. Worth revisiting once we add a test suite.

## Will not do (recorded so it doesn't keep coming up)

- **TypeScript migration.** Out of scope for now. JSDoc is the documented contract.
- **Renaming `qrynResponse.response` → `qrynResponse.data`.** Tempting, but breaking. Not worth the churn.
- **Bundling / dual ESM+CJS.** The library is a thin wrapper; consumers who need ESM can use the `default`/`named` interop their bundler provides.
