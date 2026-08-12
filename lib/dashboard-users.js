'use strict';

const authModule = require('./dashboard-auth.js');
const supabaseModule = require('./cafe24/supabase.js');

const text = value => value == null ? '' : String(value).trim();
const usernamePattern = /^[a-z0-9][a-z0-9._-]{2,31}$/;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateAccount(input = {}, { passwordRequired = false } = {}) {
  const username = text(input.username).toLowerCase();
  const email = text(input.email).toLowerCase();
  const displayName = text(input.displayName || input.display_name);
  const role = authModule.normalizeRole(input.role || 'VIEWER');
  const password = String(input.password || '');
  if (!usernamePattern.test(username)) throw Object.assign(new Error('계정명은 영문 소문자·숫자·._- 조합 3~32자로 입력해주세요.'), { status:400 });
  if (!emailPattern.test(email) || email.length > 200) throw Object.assign(new Error('이메일 형식을 확인해주세요.'), { status:400 });
  if (displayName.length < 2 || displayName.length > 80) throw Object.assign(new Error('표시 이름은 2~80자로 입력해주세요.'), { status:400 });
  if ((passwordRequired || password) && (password.length < 12 || password.length > 200)) throw Object.assign(new Error('비밀번호는 12자 이상으로 입력해주세요.'), { status:400 });
  return { username, email, displayName, role, password };
}

async function listUsers(db = supabaseModule.getSupabase()) {
  const result = await db.from('dashboard_users')
    .select('user_id,email,username,display_name,role,active,created_at,updated_at')
    .order('created_at', { ascending:true });
  if (result.error) throw result.error;
  return result.data || [];
}

async function writeAudit(db, entries) {
  if (!entries.length) return;
  const result = await db.from('dashboard_access_audit_logs').insert(entries);
  if (result.error) throw result.error;
}

async function createUser(input, {
  db = supabaseModule.getSupabase(),
  auth = authModule.createAuthClient(),
  actorUserId,
  actorUsername
} = {}) {
  const values = validateAccount(input, { passwordRequired:true });
  const created = await auth.auth.admin.createUser({
    email:values.email,
    password:values.password,
    email_confirm:true,
    app_metadata:{ harin_dashboard:true }
  });
  if (created.error) throw Object.assign(new Error(created.error.message), { status:created.error.status || 400 });
  const profile = await db.from('dashboard_users').insert({
    user_id:created.data.user.id,
    email:values.email,
    username:values.username,
    display_name:values.displayName,
    role:values.role,
    active:true
  }).select('user_id,email,username,display_name,role,active,created_at,updated_at').single();
  if (profile.error) {
    await auth.auth.admin.deleteUser(created.data.user.id).catch(()=>{});
    throw profile.error;
  }
  await writeAudit(db, [{
    actor_user_id:actorUserId || null,
    actor_username:text(actorUsername) || null,
    target_user_id:profile.data.user_id,
    event_type:'ACCOUNT_CREATED',
    detail:{ username:profile.data.username, role:profile.data.role }
  }]);
  return profile.data;
}

async function activeOwnerCount(db) {
  const result = await db.from('dashboard_users').select('user_id', { count:'exact', head:true }).eq('role', 'OWNER').eq('active', true);
  if (result.error) throw result.error;
  return result.count || 0;
}

async function updateUser(userId, input, {
  db = supabaseModule.getSupabase(),
  auth = authModule.createAuthClient(),
  actorUserId,
  actorUsername
} = {}) {
  const current = await db.from('dashboard_users').select('*').eq('user_id', userId).single();
  if (current.error) throw current.error;
  const row = current.data;
  const nextRole = input.role ? authModule.normalizeRole(input.role) : row.role;
  const nextActive = input.active === undefined ? row.active : input.active === true;
  if (row.role === 'OWNER' && row.active && (nextRole !== 'OWNER' || !nextActive) && await activeOwnerCount(db) <= 1) {
    throw Object.assign(new Error('마지막 활성 OWNER 계정은 권한을 낮추거나 비활성화할 수 없습니다.'), { status:409 });
  }
  if (actorUserId === userId && !nextActive) throw Object.assign(new Error('현재 로그인한 자신의 계정은 비활성화할 수 없습니다.'), { status:409 });
  const patch = {
    role:nextRole,
    active:nextActive,
    display_name:input.displayName ? text(input.displayName).slice(0, 80) : row.display_name,
    updated_at:new Date().toISOString()
  };
  if (patch.display_name.length < 2) throw Object.assign(new Error('표시 이름은 2자 이상이어야 합니다.'), { status:400 });
  const updated = await db.from('dashboard_users').update(patch).eq('user_id', userId)
    .select('user_id,email,username,display_name,role,active,created_at,updated_at').single();
  if (updated.error) throw updated.error;
  if (input.password) {
    if (String(input.password).length < 12 || String(input.password).length > 200) throw Object.assign(new Error('새 비밀번호는 12자 이상이어야 합니다.'), { status:400 });
    const passwordResult = await auth.auth.admin.updateUserById(userId, { password:String(input.password) });
    if (passwordResult.error) throw passwordResult.error;
  }
  if (!nextActive || nextRole !== row.role || input.password) await authModule.revokeUserSessions(userId, db);
  const auditBase = {
    actor_user_id:actorUserId || null,
    actor_username:text(actorUsername) || null,
    target_user_id:userId
  };
  const auditEntries = [];
  if (patch.display_name !== row.display_name) auditEntries.push({
    ...auditBase,
    event_type:'PROFILE_CHANGED',
    detail:{ field:'display_name' }
  });
  if (nextRole !== row.role) auditEntries.push({
    ...auditBase,
    event_type:'ROLE_CHANGED',
    detail:{ from:row.role, to:nextRole }
  });
  if (nextActive !== row.active) auditEntries.push({
    ...auditBase,
    event_type:nextActive ? 'ACCOUNT_ACTIVATED' : 'ACCOUNT_DEACTIVATED',
    detail:{}
  });
  if (input.password) auditEntries.push({ ...auditBase, event_type:'PASSWORD_RESET', detail:{} });
  await writeAudit(db, auditEntries);
  return updated.data;
}

module.exports = { activeOwnerCount, createUser, listUsers, updateUser, validateAccount };
