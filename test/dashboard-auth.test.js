'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const auth = require('../lib/dashboard-auth.js');
const loginRequest = require('../lib/dashboard-login-request.js');

function withSecret(run) {
  const previous = process.env.DASHBOARD_SESSION_SECRET;
  process.env.DASHBOARD_SESSION_SECRET = 'test-only-session-secret-with-enough-entropy';
  const restore = () => {
    if(previous===undefined)delete process.env.DASHBOARD_SESSION_SECRET;
    else process.env.DASHBOARD_SESSION_SECRET=previous;
  };
  try {
    const result = run();
    if(result && typeof result.finally === 'function') return result.finally(restore);
    restore();
    return result;
  } catch(error) {
    restore();
    throw error;
  }
}

test('재무 신뢰 토큰은 서버 서명·만료·허용 상태를 검증한다', () => withSecret(() => {
  const now = Date.parse('2026-08-12T00:00:00Z');
  const token = auth.signFinancialTrust({ status:'READY', formula_version:'financial-trust-v1', allowed:{ allowed_cpc:true, bid_increase:true } }, now);
  assert.equal(auth.verifyFinancialTrust(token, now + 1000).allowed_cpc, true);
  assert.equal(auth.verifyFinancialTrust(token, now + 1000).financial_actions, true);
  assert.equal(auth.verifyFinancialTrust(`${token}x`, now + 1000), null);
  assert.equal(auth.verifyFinancialTrust(token, now + 11 * 60 * 1000), null);
}));

test('차단 상태로 서명한 토큰은 목표 CPC를 허용하지 않는다', () => withSecret(() => {
  const token = auth.signFinancialTrust({ allowed:{ allowed_cpc:false } }, 1000);
  assert.equal(auth.verifyFinancialTrust(token, 2000).allowed_cpc, false);
  assert.equal(auth.verifyFinancialTrust(token, 2000).financial_actions, false);
}));

test('AI 집계 스냅샷 토큰은 30분 동안만 유효하고 위조를 거부한다', () => withSecret(() => {
  const now = Date.parse('2026-08-14T00:00:00Z');
  const snapshot = { analysis_type:'NAVER_EXECUTIVE_EXPLANATION', data_status:'READY' };
  const token = auth.signAiSnapshot(snapshot, now);
  assert.deepEqual(auth.verifyAiSnapshot(token, now + 1000), snapshot);
  assert.equal(auth.verifyAiSnapshot(`${token}x`, now + 1000), null);
  assert.equal(auth.verifyAiSnapshot(token, now + 31 * 60 * 1000), null);
}));

test('개인 세션은 사용자·역할·12시간 만료를 서명하고 위조를 거부한다', () => withSecret(() => {
  const expiresAt = new Date(Date.now()+60_000).toISOString();
  const token=auth.createSessionToken({sessionId:'s1',userId:'u1',username:'owner',displayName:'운영 OWNER',role:'OWNER',expiresAt});
  const session=auth.parseSession(token);
  assert.equal(session.username,'owner');
  assert.equal(session.role,'OWNER');
  assert.equal(auth.roleAtLeast(session,'OPERATOR'),true);
  assert.equal(auth.hasRole(session,['OWNER']),true);
  assert.equal(auth.parseSession(`${token}x`),null);
  assert.equal(auth.parseSession(token,Date.now()+120_000),null);
}));

test('단일 OWNER 로그인은 계정 입력 없이 비밀번호만 받는다', () => {
  const page=fs.readFileSync(path.resolve(__dirname,'../app/login/page.js'),'utf8');
  const form=fs.readFileSync(path.resolve(__dirname,'../app/login/login-form.js'),'utf8');
  const route=fs.readFileSync(path.resolve(__dirname,'../app/api/dashboard/login/route.js'),'utf8');
  assert.doesNotMatch(`${page}\n${form}`,/name="account"/);
  assert.match(form,/minLength="6"/);
  assert.match(form,/pattern="\[0-9\]\{6\}"/);
  assert.match(route,/account:'owner'/);
});

test('로그인 폼은 중복 제출을 막고 처리 상태를 즉시 알린다', () => {
  const form=fs.readFileSync(path.resolve(__dirname,'../app/login/login-form.js'),'utf8');
  assert.match(form,/submittingRef\.current/);
  assert.match(form,/event\.preventDefault\(\)/);
  assert.match(form,/disabled=\{pending\}/);
  assert.match(form,/aria-live="polite"/);
  assert.match(form,/안전하게 확인 중/);
});

test('로그인 제출 중에도 비밀번호 입력값은 폼 전송 대상에 남는다', () => {
  const form=fs.readFileSync(path.resolve(__dirname,'../app/login/login-form.js'),'utf8');
  const passwordInput=form.match(/<input\s+[\s\S]*?id="password"[\s\S]*?\/>/)?.[0]||'';
  assert.ok(passwordInput,'비밀번호 입력칸을 찾을 수 있어야 한다');
  assert.doesNotMatch(passwordInput,/(?:^|\s)disabled=\{pending\}/);
  assert.match(passwordInput,/readOnly=\{pending\}/);
});

test('로컬 HTTP 로그인만 Secure 쿠키를 해제하고 운영 HTTPS는 유지한다', () => {
  const headers = value => ({ get:name => name === 'x-forwarded-proto' ? value : null });
  assert.equal(loginRequest.secureSessionCookie({ url:'http://127.0.0.1:3310/api/dashboard/login', headers:headers(null) }),false);
  assert.equal(loginRequest.secureSessionCookie({ url:'https://harin-cafe24-sync.vercel.app/api/dashboard/login', headers:headers(null) }),true);
  assert.equal(loginRequest.secureSessionCookie({ url:'http://internal/api/dashboard/login', headers:headers('https') }),true);
  assert.equal(auth.sessionCookieOptions(undefined,{secure:false}).secure,false);
  assert.equal(auth.sessionCookieOptions().secure,true);
});

test('로그인 우회는 명시적으로 켠 로컬 개발에서만 OWNER 세션을 만든다', async () => {
  assert.equal(auth.developmentAuthBypassEnabled({ NODE_ENV:'development', HARIN_DEV_AUTH_BYPASS:'1' }),true);
  assert.equal(auth.developmentAuthBypassEnabled({ NODE_ENV:'development', HARIN_DEV_AUTH_BYPASS:'0' }),false);
  assert.equal(auth.developmentAuthBypassEnabled({ NODE_ENV:'production', HARIN_DEV_AUTH_BYPASS:'1' }),false);
  assert.equal(auth.developmentAuthBypassEnabled({ NODE_ENV:'test', HARIN_DEV_AUTH_BYPASS:'1' }),false);

  const previousNodeEnv=process.env.NODE_ENV;
  const previousBypass=process.env.HARIN_DEV_AUTH_BYPASS;
  try {
    process.env.NODE_ENV='development';
    process.env.HARIN_DEV_AUTH_BYPASS='1';
    const session=await auth.validateSession('');
    assert.equal(session.role,'OWNER');
    assert.equal(session.username,'local-owner');
    assert.equal(auth.verifySession(''),true);

    process.env.NODE_ENV='production';
    assert.equal(await auth.validateSession(''),null);
    assert.equal(auth.verifySession(''),false);
  } finally {
    if(previousNodeEnv===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=previousNodeEnv;
    if(previousBypass===undefined)delete process.env.HARIN_DEV_AUTH_BYPASS;else process.env.HARIN_DEV_AUTH_BYPASS=previousBypass;
  }
});

test('비밀번호 검증은 제한 시간 안에 끝나며 성공 후 불필요한 원격 로그아웃을 기다리지 않는다', async () => {
  const source=fs.readFileSync(path.resolve(__dirname,'../lib/dashboard-auth.js'),'utf8');
  assert.doesNotMatch(source,/client\.auth\.signOut/);
  let signOutCalls=0;
  const client={auth:{
    signInWithPassword:async()=>({data:{user:{id:'u1'}},error:null}),
    signOut:async()=>{signOutCalls+=1;return new Promise(()=>{});}
  }};
  const result=await auth.signInWithTimeout(client,{email:'owner@example.com',password:'123456'},50);
  assert.equal(result.data.user.id,'u1');
  assert.equal(signOutCalls,0);

  const stalled={auth:{signInWithPassword:()=>new Promise(()=>{})}};
  await assert.rejects(
    auth.signInWithTimeout(stalled,{email:'owner@example.com',password:'123456'},15),
    error=>error?.code==='LOGIN_AUTH_TIMEOUT'
  );
});

test('로그인 준비 조회와 성공 후 세션 저장은 독립 작업을 병렬로 끝낸다', async () => withSecret(async () => {
  const deferred = () => {
    let resolve;
    const promise = new Promise(done => { resolve = done; });
    return { promise, resolve };
  };
  const attemptRead = deferred();
  const profileRead = deferred();
  const attemptDelete = deferred();
  const sessionInsert = deferred();
  const expiredSessionCleanup = deferred();
  const events = [];
  const chain = terminal => ({
    select(){ return this; }, delete(){ return this; }, update(){ return this; },
    eq(){ return terminal === attemptDelete ? terminal.promise : this; },
    is(){ return this; }, lt(){ events.push('expired-session-cleanup'); return terminal.promise; },
    maybeSingle(){
      events.push(terminal === attemptRead ? 'attempt-read' : 'profile-read');
      return terminal.promise;
    },
    insert(){ events.push('session-insert'); return terminal.promise; }
  });
  const db = {
    from(table){
      if(table === 'dashboard_users') return chain(profileRead);
      if(table === 'dashboard_sessions') {
        return {
          insert(){ events.push('session-insert'); return sessionInsert.promise; },
          update(){ return chain(expiredSessionCleanup); }
        };
      }
      return {
        select(){ return chain(attemptRead); },
        delete(){ events.push('attempt-delete'); return chain(attemptDelete); }
      };
    }
  };
  const authClient = { auth:{
    signInWithPassword:async()=>({ data:{ user:{ id:'owner-user' } }, error:null })
  } };
  const pending = auth.authenticateAccount({
    account:'owner', password:'123456', ip:'127.0.0.1', userAgent:'test'
  }, db, { authClient });

  assert.deepEqual(events.slice(0, 2).sort(), ['attempt-read', 'profile-read']);
  attemptRead.resolve({ data:null, error:null });
  profileRead.resolve({
    data:{ user_id:'owner-user', email:'owner@example.com', username:'owner', display_name:'운영 OWNER', role:'OWNER', active:true },
    error:null
  });
  await new Promise(resolve => setImmediate(resolve));
  assert.ok(events.includes('attempt-delete'));
  assert.ok(events.includes('session-insert'));
  assert.ok(events.includes('expired-session-cleanup'));

  attemptDelete.resolve({ error:null });
  sessionInsert.resolve({ error:null });
  expiredSessionCleanup.resolve({ error:null });
  const result = await pending;
  assert.equal(result.session.userId, 'owner-user');
}));

test('단일 OWNER Proxy는 다른 역할과 다른 출처 요청을 차단한다', () => {
  const proxy=fs.readFileSync(path.resolve(__dirname,'../proxy.js'),'utf8');
  assert.match(proxy,/session\.role !== 'OWNER'/);
  assert.match(proxy,/CSRF_ORIGIN_MISMATCH/);
  assert.match(proxy,/x-harin-role/);
  assert.match(proxy,/x-harin-session-verified/);
  assert.match(proxy,/validateSession/);
});

test('Proxy가 검증한 요청 헤더는 페이지에서 추가 DB 조회 없이 OWNER 세션으로 복원한다',()=>{
  const headers=new Map([
    ['x-harin-session-verified','1'],
    ['x-harin-user-id','owner-user'],
    ['x-harin-username','owner'],
    ['x-harin-role','OWNER']
  ]);
  const session=auth.verifiedRequestSession({get:name=>headers.get(name)||null});
  assert.deepEqual(session,{userId:'owner-user',username:'owner',role:'OWNER'});
  assert.equal(auth.verifiedRequestSession({get:()=>null}),null);
  assert.equal(auth.verifiedRequestSession({get:name=>name==='x-harin-session-verified'?'1':name==='x-harin-role'?'VIEWER':null}),null);
});

test('보호 페이지는 Proxy가 검증한 OWNER 세션을 재사용해 세션 DB 조회를 생략한다',async()=>{
  const requestHeaders=new Map([
    ['x-harin-session-verified','1'],
    ['x-harin-user-id','owner-user'],
    ['x-harin-username','owner'],
    ['x-harin-role','OWNER']
  ]);
  let databaseReads=0;
  const db={from(){databaseReads+=1;throw new Error('verified request must not query dashboard_sessions');}};
  const session=await auth.resolveRequestSession({
    headers:{get:name=>requestHeaders.get(name)||null},
    token:'ignored-after-proxy-verification',
    db
  });
  assert.deepEqual(session,{userId:'owner-user',username:'owner',role:'OWNER'});
  assert.equal(databaseReads,0);
});

test('모든 보호 페이지 진입점은 Proxy 검증 세션을 우선 재사용한다',()=>{
  const files=[
    'app/page.js','app/dashboard-route.js','app/ab-tests/layout.js','app/ai-knowledge/layout.js',
    'app/approvals/layout.js','app/data-collection/layout.js','app/diagnoses/layout.js',
    'app/execution-validation/layout.js','app/market-intelligence/layout.js',
    'app/notifications/layout.js','app/product-analysis/layout.js'
  ];
  for(const file of files){
    const source=fs.readFileSync(path.resolve(__dirname,'..',file),'utf8');
    assert.match(source,/resolveRequestSession/,`${file} must reuse Proxy verification`);
    assert.match(source,/headers\(\)/,`${file} must read the verified request headers`);
  }
});

test('개발 로그인 우회는 쿠키가 없는 Proxy 요청에도 적용된다', () => {
  const proxy=fs.readFileSync(path.resolve(__dirname,'../proxy.js'),'utf8');
  assert.match(proxy,/developmentAuthBypassEnabled/);
  assert.match(proxy,/token \|\| developmentBypass/);
  assert.match(proxy,/pathname === '\/login' && \(token \|\| developmentBypass\)/);
});

test('계정·세션·로그인 제한 테이블은 브라우저 역할에서 격리된다', () => {
  const migration=fs.readFileSync(path.resolve(__dirname,'../supabase/migrations/20260812182508_add_dashboard_accounts_and_rbac.sql'),'utf8');
  assert.match(migration,/dashboard_users[\s\S]*enable row level security/i);
  assert.match(migration,/dashboard_sessions[\s\S]*enable row level security/i);
  assert.match(migration,/dashboard_access_audit_logs[\s\S]*enable row level security/i);
  assert.match(migration,/revoke update, delete on public\.dashboard_access_audit_logs from service_role/i);
  assert.match(migration,/revoke all[\s\S]*from public, anon, authenticated/i);
  assert.match(migration,/token_hash text not null unique/i);
  assert.doesNotMatch(migration,/password\s+text/i);
});
