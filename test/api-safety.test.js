'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const safety = require('../lib/api/safety.js');
const nextConfig = require('../next.config.js');

test('API JSON responses are explicitly private and non-cacheable', () => {
  const response = safety.json({ ok:true });
  assert.match(response.headers.get('cache-control'), /no-store/);
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
});

test('JSON input rejects wrong media type, malformed input, arrays, and oversized bodies', async () => {
  await assert.rejects(() => safety.readJson(new Request('https://example.com',{method:'POST',body:'{}'})), error => error.status === 415);
  await assert.rejects(() => safety.readJson(new Request('https://example.com',{method:'POST',headers:{'content-type':'application/json'},body:'{'})), error => error.code === 'INVALID_JSON');
  await assert.rejects(() => safety.readJson(new Request('https://example.com',{method:'POST',headers:{'content-type':'application/json'},body:'[]'})), error => error.code === 'INVALID_JSON_OBJECT');
  await assert.rejects(() => safety.readJson(new Request('https://example.com',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({value:'12345'})}),{maxBytes:5}), error => error.status === 413);
});

test('XLSX validation checks ZIP file signature instead of trusting its name', () => {
  assert.throws(() => safety.assertXlsx(Buffer.from('not an xlsx'),'fake.xlsx'), error => error.code === 'INVALID_XLSX');
  assert.equal(safety.assertXlsx(Buffer.from([0x50,0x4b,0x03,0x04])).length, 4);
});

test('date validation rejects impossible calendar dates', () => {
  assert.equal(safety.isoDate('2026-08-13'), '2026-08-13');
  assert.equal(safety.isoDate('2026-02-31'), null);
  assert.equal(safety.isoDate('not-a-date'), null);
});

test('Next.js headers apply security headers globally and no-store to APIs', async () => {
  const rules = await nextConfig.headers();
  const global = rules.find(rule => rule.source === '/:path*');
  const api = rules.find(rule => rule.source === '/api/:path*');
  assert.equal(global.headers.find(item => item.key === 'X-Frame-Options').value, 'DENY');
  assert.match(api.headers.find(item => item.key === 'Cache-Control').value, /no-store/);
});

test('Cafe24 manual collection is POST-only and diagnostics require a session', () => {
  const root = path.resolve(__dirname, '..');
  const sync = fs.readFileSync(path.join(root,'app/api/cafe24/fetch-all/route.js'),'utf8');
  const status = fs.readFileSync(path.join(root,'app/api/cafe24/status/route.js'),'utf8');
  const connectionTest = fs.readFileSync(path.join(root,'app/api/cafe24/test/route.js'),'utf8');
  assert.match(sync, /export async function POST/);
  assert.doesNotMatch(sync, /export async function GET/);
  assert.match(status, /isAuthorized/);
  assert.match(connectionTest, /isAuthorized/);
  const ignore = fs.readFileSync(path.join(root,'.vercelignore'),'utf8');
  assert.match(ignore, /^\/test$/m);
  assert.doesNotMatch(ignore, /^test$/m);
});

test('Cafe24 diagnostic routes reject unauthenticated requests before external access', async () => {
  const statusRoute = await import('../app/api/cafe24/status/route.js');
  const testRoute = await import('../app/api/cafe24/test/route.js');
  const request = new Request('https://example.com/api/cafe24/status');
  assert.equal((await statusRoute.GET(request)).status, 401);
  assert.equal((await testRoute.GET(request)).status, 401);
});
