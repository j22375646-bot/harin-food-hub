'use strict';

const { createClient } = require('@supabase/supabase-js');

let client;
function getSupabase() {
  if (!client) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required on the server');
    client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  }
  return client;
}

async function db(table, operation) {
  const result = await operation(getSupabase().from(table));
  if (result.error) throw new Error(`${table}: ${result.error.message}`);
  return result;
}

async function insertRaw(row) {
  return db('raw_api_responses', q => q.insert(row));
}

async function startSync() {
  const { data } = await db('sync_logs', q => q.insert({ platform: 'CAFE24', job_type: 'FETCH_ALL', status: 'RUNNING' }).select('id').single());
  return data.id;
}

async function finishSync(id, values) {
  return db('sync_logs', q => q.update({ ...values, finished_at: new Date().toISOString() }).eq('id', id));
}

module.exports = { getSupabase, db, insertRaw, startSync, finishSync };
