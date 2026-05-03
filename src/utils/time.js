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
