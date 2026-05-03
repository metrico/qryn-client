const { describe, it } = require('node:test');
const assert = require('node:assert');
const { GigapipeClient } = require('../src/index');

const flush = () => new Promise(resolve => setImmediate(resolve));

describe('GigapipeClient auth back-compat shim', () => {
  it('emits a DeprecationWarning when given legacy auth shape', async () => {
    const seen = [];
    const handler = (warning) => seen.push(warning);
    process.on('warning', handler);
    try {
      // eslint-disable-next-line no-new
      new GigapipeClient({ baseUrl: 'http://localhost:3100', auth: { username: 'u', password: 'p' } });
      await flush();
      const found = seen.find(w => w.code === 'GIGAPIPE_AUTH_LEGACY');
      assert.ok(found, 'expected a GIGAPIPE_AUTH_LEGACY warning');
    } finally {
      process.off('warning', handler);
    }
  });

  it('does NOT emit a warning when given the new typed auth shape', async () => {
    const seen = [];
    const handler = (warning) => { if (warning.code === 'GIGAPIPE_AUTH_LEGACY') seen.push(warning); };
    process.on('warning', handler);
    try {
      // eslint-disable-next-line no-new
      new GigapipeClient({ baseUrl: 'http://localhost:3100', auth: { type: 'basic', username: 'u', password: 'p' } });
      await flush();
      assert.equal(seen.length, 0);
    } finally {
      process.off('warning', handler);
    }
  });

  it('does NOT emit a warning when no auth is provided', async () => {
    const seen = [];
    const handler = (warning) => { if (warning.code === 'GIGAPIPE_AUTH_LEGACY') seen.push(warning); };
    process.on('warning', handler);
    try {
      // eslint-disable-next-line no-new
      new GigapipeClient({ baseUrl: 'http://localhost:3100' });
      await flush();
      assert.equal(seen.length, 0);
    } finally {
      process.off('warning', handler);
    }
  });
});
