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
