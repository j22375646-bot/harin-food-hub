'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');

const tokenPath = process.env.CAFE24_TOKEN_PATH || path.join(os.tmpdir(), 'cafe24-token.json');

async function readToken() {
  if (process.env.VERCEL || process.env.CAFE24_TOKEN_STORE === 'supabase') {
    const { data, error } = await require('./supabase').getSupabase()
      .from('cafe24_oauth_tokens').select('token_data')
      .eq('mall_id', process.env.CAFE24_MALL_ID).maybeSingle();
    if (error) throw new Error(`Unable to read Cafe24 token: ${error.message}`);
    return data?.token_data || null;
  }
  try { return JSON.parse(await fs.readFile(/*turbopackIgnore: true*/ tokenPath, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

async function writeToken(token) {
  const normalized = {
    ...token,
    expires_at: token.expires_at || new Date(Date.now() + Number(token.expires_in || 7200) * 1000).toISOString(),
    refresh_token_expires_at: token.refresh_token_expires_at || null,
    saved_at: new Date().toISOString()
  };
  if (process.env.VERCEL || process.env.CAFE24_TOKEN_STORE === 'supabase') {
    const { error } = await require('./supabase').getSupabase()
      .from('cafe24_oauth_tokens')
      .upsert({ mall_id: process.env.CAFE24_MALL_ID, token_data: normalized, updated_at: new Date().toISOString() }, { onConflict: 'mall_id' });
    if (error) throw new Error(`Unable to store Cafe24 token: ${error.message}`);
  } else {
    await fs.writeFile(tokenPath, JSON.stringify(normalized, null, 2), { mode: 0o600 });
  }
  return normalized;
}

module.exports = { readToken, writeToken, tokenPath };
