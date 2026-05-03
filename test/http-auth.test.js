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
