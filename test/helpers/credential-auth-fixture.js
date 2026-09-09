'use strict';
const fs=require('node:fs/promises'),path=require('node:path');
const {createHash}=require('node:crypto');
const sessionId='44444444-4444-4444-8444-444444444444';
const userId='22222222-2222-4222-8222-222222222222';
const credential='test.signature';
async function setupCredentialAuth(db){
 await db.exec('create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create table auth.users(id uuid primary key)');
 for(const file of ['supabase/migrations/20260812182508_add_dashboard_accounts_and_rbac.sql','lib/tenancy/sql/auth-session-fence.sql'])await db.exec(await fs.readFile(path.join(__dirname,'../..',file),'utf8'));
 await db.query('insert into auth.users values($1)',[userId]);
 await db.query("insert into dashboard_users(user_id,email,username,display_name,role) values($1,'synthetic@example.test','synthetic','Synthetic','OWNER')",[userId]);
 await db.query('insert into moaon_auth.account_state(user_id) values($1)',[userId]);
 await db.query("insert into dashboard_sessions(id,user_id,token_hash,username,display_name,role,expires_at) values($1,$2,$3,'synthetic','Synthetic','OWNER',clock_timestamp()+interval '1 hour')",[sessionId,userId,createHash('sha256').update(credential,'utf8').digest('hex')]);
}
module.exports={setupCredentialAuth,sessionId,userId,credential};
