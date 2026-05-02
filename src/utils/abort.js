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
