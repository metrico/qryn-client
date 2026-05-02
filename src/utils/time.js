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
