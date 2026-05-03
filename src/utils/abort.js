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
