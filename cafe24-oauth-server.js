'use strict';

require('dotenv').config();
const express = require('express');
const { getConfig } = require('./lib/cafe24/config');
const { exchangeCode, adminGet } = require('./lib/cafe24/client');
const { readToken, tokenPath } = require('./lib/cafe24/token-store');
const { syncAll } = require('./lib/cafe24/sync');
const { createState, validState } = require('./lib/cafe24/oauth-state');

const app = express();
app.use(express.json({ limit: '100kb' }));
app.get('/', (_req, res) => res.type('text').send('Cafe24 OAuth + Supabase sync server'));

app.get('/oauth/cafe24/start', (_req, res, next) => {
  try {
    const config = getConfig();
    const state = createState(config.clientSecret);
    const url = new URL(`https://${config.mallId}.cafe24api.com/api/v2/oauth/authorize`);
    url.search = new URLSearchParams({ response_type: 'code', client_id: config.clientId, state, redirect_uri: config.redirectUri, scope: config.scopes.join(',') });
    res.redirect(url.toString());
  } catch (error) { next(error); }
});

app.get('/oauth/cafe24/callback', async (req, res, next) => {
  try {
    const config = getConfig();
    if (!validState(req.query.state, config.clientSecret)) return res.status(400).json({ ok: false, error: 'Invalid or expired OAuth state' });
    if (!req.query.code) return res.status(400).json({ ok: false, error: req.query.error || 'Missing authorization code' });
    await exchangeCode(config, String(req.query.code));
    res.json({ ok: true, connected: true });
  } catch (error) { next(error); }
});

app.get('/api/cafe24/status', async (_req, res, next) => {
  try { const config = getConfig(); res.json({ configured: true, connected: Boolean(await readToken()), mallId: config.mallId, tokenStorage: tokenPath }); }
  catch (error) { next(error); }
});

app.get('/api/cafe24/test', async (_req, res, next) => {
  try { const result = await adminGet(getConfig(), '/products', { limit: 1 }); res.json({ ok: true, httpStatus: result.status, productCount: result.payload?.products?.length || 0 }); }
  catch (error) { next(error); }
});

app.get('/api/cafe24/fetch-all', async (_req, res) => {
  try { res.json({ ok: true, ...(await syncAll(getConfig())) }); }
  catch (error) { res.status(502).json({ ok: false, error: error.message, ...(error.syncResult || {}) }); }
});

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({ ok: false, error: error.message });
});

if (require.main === module) app.listen(Number(process.env.PORT || 3000), () => console.log(`Cafe24 sync server listening on ${process.env.PORT || 3000}`));
module.exports = app;
module.exports.default = app;
