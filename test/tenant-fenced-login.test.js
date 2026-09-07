'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const vm = require('node:vm');
const Module = require('node:module');
const {PGlite} = require('@electric-sql/pglite');
const auth = require('../lib/dashboard-auth.js');
const {createAuthSessionStore} = require('../lib/tenancy/auth-session-store.js');

const USER_A='20000000-0000-4000-8000-000000000001';
const USER_B='20000000-0000-4000-8000-000000000002';
const PROFILE_A={user_id:USER_A,email:'owner-a@example.test',username:'owner-a',display_name:'Owner A',role:'OWNER',active:true};
const PROFILE_B={user_id:USER_B,email:'owner-b@example.test',username:'owner-b',display_name:'Owner B',role:'VIEWER',active:true};
const CONFIRMED_AT='2026-09-07T00:00:00.000Z';
function sessionWindow(now=Date.now()){
  return {issuedAt:new Date(now).toISOString(),expiresAt:new Date(now+12*60*60*1000).toISOString()};
}
async function getSessionWindow(){return sessionWindow();}

async function authWithIndependentAppClock(offsetMs){
  const filename=path.join(__dirname,'../lib/dashboard-auth.js');
  const source=await fs.readFile(filename,'utf8');
  const loaded={exports:{}};
  const localRequire=Module.createRequire(filename);
  class AppDate extends Date {}
  AppDate.now=()=>Date.now()+offsetMs;
  const context=vm.createContext({
    module:loaded,exports:loaded.exports,require:localRequire,__filename:filename,__dirname:path.dirname(filename),
    Date:AppDate,Buffer,process,console,setTimeout,clearTimeout,URL,URLSearchParams,
  });
  const compile=new vm.Script(Module.wrap(source),{filename}).runInContext(context);
  compile(loaded.exports,localRequire,loaded,filename,path.dirname(filename));
  return {auth:loaded.exports,appNow:()=>AppDate.now()};
}

function withSecret(run){
  const previous=process.env.DASHBOARD_SESSION_SECRET;
  process.env.DASHBOARD_SESSION_SECRET='test-only-session-secret-with-enough-entropy';
  return Promise.resolve().then(run).finally(()=>{
    if(previous===undefined)delete process.env.DASHBOARD_SESSION_SECRET;
    else process.env.DASHBOARD_SESSION_SECRET=previous;
  });
}

function database(profiles=PROFILE_A,attempt=null){
  const sequence=Array.isArray(profiles)?profiles:[profiles];
  let profileReads=0,directSessionInserts=0,failures=0;
  const db={from(table){
    if(table==='dashboard_users')return {
      select(){return this;},eq(){return this;},
      async maybeSingle(){
        const profile=sequence[Math.min(profileReads++,sequence.length-1)];
        if(typeof profile==='function')return profile();
        return {data:profile?{...profile}:null,error:null};
      }
    };
    if(table==='dashboard_login_attempts')return {
      select(){return this;},delete(){return this;},eq(){return this;},
      async maybeSingle(){return {data:attempt,error:null};},async upsert(){failures++;return {error:null};},
      then(resolve){return Promise.resolve({error:null}).then(resolve);}
    };
    if(table==='dashboard_sessions')return {
      insert(){directSessionInserts++;return Promise.resolve({error:null});},
      update(){return {eq(){return this;},is(){return this;},lt(){return Promise.resolve({error:null});}};}
    };
    throw new Error(`unexpected table ${table}`);
  }};
  return {db,get profileReads(){return profileReads;},get directSessionInserts(){return directSessionInserts;},get failures(){return failures;}};
}

function providerUser(overrides={}){
  return {id:USER_A,email:PROFILE_A.email,email_confirmed_at:CONFIRMED_AT,is_anonymous:false,deleted_at:null,banned_until:null,...overrides};
}
function deferred(){
  let resolve,reject;
  const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});
  return {promise,resolve,reject};
}

test('fenced login orders ticket, authoritative password auth, and RPC-only session issue',()=>withSecret(async()=>{
  const events=[];
  const state=database();
  const sessionFence={
    async beginLogin(){events.push('begin-login');return true;},
    async getSessionWindow(){events.push('get-window');return sessionWindow();},
    async issueSession(){events.push('issue-session');return true;}
  };
  const authClient={auth:{async signInWithPassword(){events.push('password-auth');return {data:{user:providerUser(),session:{}},error:null};}}};
  const result=await auth.authenticateAccount({account:'owner-a',password:'123456',ip:'127.0.0.1'},state.db,{authClient,sessionFence});
  assert.deepEqual(events,['begin-login','password-auth','get-window','issue-session']);
  assert.equal(state.directSessionInserts,0);
  assert.equal(state.profileReads,2);
  assert.equal(auth.parseSession(result.token).userId,USER_A);
}));

test('dynamic unit window reaches the issue stage after the former fixed-fixture boundary',()=>withSecret(async()=>{
  const previousNow=Date.now;
  const futureNow=Date.parse('2030-01-02T03:04:05.678Z');
  Date.now=()=>futureNow;
  try{
    const state=database();let windows=0,issues=0,issued;
    const result=await auth.authenticateAccount({account:'owner-a',password:'123456'},state.db,{
      authClient:{auth:{signInWithPassword:async()=>({data:{user:providerUser(),session:{}},error:null})}},
      sessionFence:{
        beginLogin:async()=>true,
        getSessionWindow:async()=>{windows++;return sessionWindow();},
        issueSession:async value=>{issues++;issued=value;return true;},
      }
    });
    assert.equal(windows,1);assert.equal(issues,1);
    assert.equal(issued.expiresAt,'2030-01-02T15:04:05.678Z');
    const payload=JSON.parse(Buffer.from(result.token.split('.')[0],'base64url').toString('utf8'));
    assert.equal(payload.exp-payload.iat,43200);
    assert.equal(auth.parseSession(result.token,futureNow).userId,USER_A);
    assert.equal(state.directSessionInserts,0);
  }finally{Date.now=previousNow;}
}));

test('explicit fenced dependencies and timeouts fail closed instead of selecting legacy writes',()=>withSecret(async()=>{
  const state=database();
  const input={account:'owner-a',password:'123456',ip:'127.0.0.1'};
  const authClient={auth:{signInWithPassword:async()=>({data:{user:providerUser(),session:{}},error:null})}};
  for(const sessionFence of [null,{}, {beginLogin:async()=>true}, {issueSession:async()=>true},
    {beginLogin:async()=>true,issueSession:async()=>true}]){
    await assert.rejects(()=>auth.authenticateAccount(input,state.db,{authClient,sessionFence}),TypeError);
  }
  for(const fenceTimeoutMs of [0,1.5,30001,NaN,'10']){
    await assert.rejects(()=>auth.authenticateAccount(input,state.db,{authClient,fenceTimeoutMs}),TypeError);
  }
  assert.equal(state.directSessionInserts,0);
}));

test('the direct session seam requires a server UUID ticket and confirmed RPC result',()=>withSecret(async()=>{
  const state=database();
  let issues=0;
  const base={beginLogin:async()=>true,getSessionWindow,issueSession:async()=>{issues++;return true;}};
  for(const ticketId of [undefined,null,'client-ticket','00000000-0000-0000-0000-000000000000']){
    await assert.rejects(()=>auth.createDatabaseSession(PROFILE_A,{},state.db,{sessionFence:base,ticketId}),TypeError);
  }
  for(const issueSession of [async()=>false,async()=>null,async()=>{throw Error('secret write detail');}]){
    await assert.rejects(
      ()=>auth.createDatabaseSession(PROFILE_A,{},state.db,{sessionFence:{...base,issueSession},ticketId:'30000000-0000-4000-8000-000000000001'}),
      error=>error.code==='LOGIN_AUTH_UNAVAILABLE'&&!error.message.includes('secret')
    );
  }
  assert.equal(issues,0);
  assert.equal(state.directSessionInserts,0);
}));

test('username and email login bind only server profile identity and a server ticket',()=>withSecret(async()=>{
  for(const account of [PROFILE_A.username,PROFILE_A.email.toUpperCase()]){
    const state=database();
    const calls=[];
    const sessionFence={
      async beginLogin(value){calls.push(['begin',value]);return true;},
      getSessionWindow,
      async issueSession(value){calls.push(['issue',value]);return true;}
    };
    const authClient={auth:{async signInWithPassword(credentials){
      assert.deepEqual(credentials,{email:PROFILE_A.email,password:'123456'});
      return {data:{user:providerUser(),session:{}},error:null};
    }}};
    const result=await auth.authenticateAccount({
      account,password:'123456',ip:'127.0.0.1',userId:'client-user',ticketId:'client-ticket',role:'VIEWER'
    },state.db,{authClient,sessionFence});
    assert.equal(calls[0][1].userId,USER_A);
    assert.match(calls[0][1].ticketId,/^[0-9a-f-]{36}$/i);
    assert.notEqual(calls[0][1].ticketId,'client-ticket');
    assert.equal(calls[1][1].ticketId,calls[0][1].ticketId);
    assert.equal(calls[1][1].userId,USER_A);
    assert.deepEqual(calls[1][1].expectedProfile,{
      email:PROFILE_A.email,username:PROFILE_A.username,displayName:PROFILE_A.display_name,role:PROFILE_A.role
    });
    assert.equal(auth.parseSession(result.token).role,'OWNER');
  }
}));

test('missing and inactive profiles never receive a login ticket or a session',()=>withSecret(async()=>{
  for(const profile of [null,{...PROFILE_A,active:false}]){
    const state=database(profile);
    let begins=0,issues=0;
    const sessionFence={beginLogin:async()=>{begins++;return true;},getSessionWindow,issueSession:async()=>{issues++;return true;}};
    const authClient={auth:{signInWithPassword:async()=>({data:{user:providerUser(),session:{}},error:null})}};
    await assert.rejects(
      ()=>auth.authenticateAccount({account:'owner-a',password:'123456'},state.db,{authClient,sessionFence}),
      error=>error.code==='INVALID_CREDENTIALS'
    );
    assert.equal(begins,0);
    assert.equal(issues,0);
    assert.equal(state.directSessionInserts,0);
  }
}));

test('input and rate-limit gates run before the server ticket is created',()=>withSecret(async()=>{
  let begins=0,authCalls=0;
  const sessionFence={beginLogin:async()=>{begins++;return true;},getSessionWindow,issueSession:async()=>true};
  const authClient={auth:{signInWithPassword:async()=>{authCalls++;return {data:{user:providerUser(),session:{}},error:null};}}};
  await assert.rejects(
    ()=>auth.authenticateAccount({account:'owner-a',password:'short'},database().db,{authClient,sessionFence}),
    error=>error.code==='INVALID_CREDENTIALS'
  );
  const blocked={blocked_until:new Date(Date.now()+60_000).toISOString()};
  await assert.rejects(
    ()=>auth.authenticateAccount({account:'owner-a',password:'123456'},database(PROFILE_A,blocked).db,{authClient,sessionFence}),
    error=>error.code==='LOGIN_RATE_LIMITED'
  );
  assert.equal(begins,0);assert.equal(authCalls,0);
}));

test('malformed or unsafe provider identities cannot issue a fenced session',()=>withSecret(async()=>{
  const cases=[
    {id:USER_B},
    {email:'other@example.test'},
    {email_confirmed_at:null},
    {email_confirmed_at:'2026-02-31T00:00:00.000Z'},
    {email_confirmed_at:new Date(Date.now()+60_000).toISOString()},
    {is_anonymous:true},
    {deleted_at:CONFIRMED_AT},
    {banned_until:new Date(Date.now()+60_000).toISOString()},
    {banned_until:'not-a-time'},
  ];
  for(const overrides of cases){
    const state=database();
    let issues=0;
    const sessionFence={beginLogin:async()=>true,getSessionWindow,issueSession:async()=>{issues++;return true;}};
    const authClient={auth:{signInWithPassword:async()=>({data:{user:providerUser(overrides),session:{}},error:null})}};
    await assert.rejects(
      ()=>auth.authenticateAccount({account:'owner-a',password:'123456'},state.db,{authClient,sessionFence}),
      error=>error.code==='INVALID_CREDENTIALS'
    );
    assert.equal(issues,0);
    assert.equal(state.directSessionInserts,0);
    assert.equal(state.failures,1);
  }
}));

test('the post-auth profile read supplies current role and username, while unsafe changes reject',()=>withSecret(async()=>{
  const updated={...PROFILE_A,username:'renamed-owner',display_name:'Renamed Owner',role:'VIEWER'};
  const state=database([PROFILE_A,updated]);
  let issued;
  const sessionFence={beginLogin:async()=>true,getSessionWindow,issueSession:async value=>{issued=value;return true;}};
  const authClient={auth:{signInWithPassword:async()=>({data:{user:providerUser(),session:{}},error:null})}};
  const result=await auth.authenticateAccount({account:'owner-a',password:'123456'},state.db,{authClient,sessionFence});
  const session=auth.parseSession(result.token);
  assert.equal(session.username,'renamed-owner');
  assert.equal(session.displayName,'Renamed Owner');
  assert.equal(session.role,'VIEWER');
  assert.equal(issued.userId,USER_A);

  for(const fresh of [null,{...PROFILE_A,active:false},{...PROFILE_A,email:'changed@example.test'}]){
    const rejectedState=database([PROFILE_A,fresh]);
    let issues=0;
    await assert.rejects(
      ()=>auth.authenticateAccount({account:'owner-a',password:'123456'},rejectedState.db,{
        authClient,sessionFence:{beginLogin:async()=>true,getSessionWindow,issueSession:async()=>{issues++;return true;}}
      }),
      error=>error.code==='INVALID_CREDENTIALS'
    );
    assert.equal(issues,0);
  }
}));

test('provider service errors remain unavailable and are never counted as wrong passwords',()=>withSecret(async()=>{
  for(const mode of ['response','throw']){
    const state=database();
    let issues=0;
    const providerError={status:503,code:'provider_down',message:'secret provider detail'};
    const authClient={auth:{signInWithPassword:async()=>{
      if(mode==='throw')throw providerError;
      return {data:{user:null,session:null},error:providerError};
    }}};
    await assert.rejects(
      ()=>auth.authenticateAccount({account:'owner-a',password:'123456'},state.db,{
        authClient,sessionFence:{beginLogin:async()=>true,getSessionWindow,issueSession:async()=>{issues++;return true;}}
      }),
      error=>error.code==='LOGIN_AUTH_UNAVAILABLE'&&!error.message.includes('secret')
    );
    assert.equal(state.failures,0);
    assert.equal(issues,0);
  }
}));

test('malformed auth results and dependency errors with forged safe codes are still sanitized',()=>withSecret(async()=>{
  for(const signInWithPassword of [
    async()=>null,
    async()=>({data:null,error:null}),
    async()=>({data:{user:providerUser(),session:null},error:null}),
    async()=>{throw Object.assign(new Error('secret timeout detail'),{code:'LOGIN_AUTH_TIMEOUT'});}
  ]){
    const state=database();let issues=0;
    await assert.rejects(
      ()=>auth.authenticateAccount({account:'owner-a',password:'123456'},state.db,{
        authClient:{auth:{signInWithPassword}},
        sessionFence:{beginLogin:async()=>true,getSessionWindow,issueSession:async()=>{issues++;return true;}}
      }),
      error=>['LOGIN_AUTH_UNAVAILABLE','LOGIN_AUTH_TIMEOUT'].includes(error.code)&&!error.message.includes('secret')
    );
    assert.equal(issues,0);
    assert.equal(state.failures,0);
  }
  const state=database();
  await assert.rejects(
    ()=>auth.authenticateAccount({account:'owner-a',password:'123456'},state.db,{
      authClient:{auth:{signInWithPassword:async()=>({data:{user:providerUser(),session:{}},error:null})}},
      sessionFence:{beginLogin:async()=>{throw Object.assign(new Error('secret fence detail'),{code:'LOGIN_AUTH_UNAVAILABLE'});},getSessionWindow,issueSession:async()=>true}
    }),
    error=>error.code==='LOGIN_AUTH_UNAVAILABLE'&&!error.message.includes('secret')
  );
}));

test('begin-login failure or timeout cannot reach password auth or session issue',()=>withSecret(async()=>{
  for(const beginLogin of [async()=>false,async()=>{throw Error('secret fence detail');}]){
    const state=database();
    let authCalls=0,issues=0;
    await assert.rejects(
      ()=>auth.authenticateAccount({account:'owner-a',password:'123456'},state.db,{
        authClient:{auth:{signInWithPassword:async()=>{authCalls++;return {data:{user:providerUser(),session:{}},error:null};}}},
        sessionFence:{beginLogin,getSessionWindow,issueSession:async()=>{issues++;return true;}}
      }),
      error=>error.code==='LOGIN_AUTH_UNAVAILABLE'&&!error.message.includes('secret')
    );
    assert.equal(authCalls,0);assert.equal(issues,0);assert.equal(state.directSessionInserts,0);
  }

  const late=deferred(),state=database();
  let authCalls=0,issues=0;
  const pending=auth.authenticateAccount({account:'owner-a',password:'123456'},state.db,{
    authClient:{auth:{signInWithPassword:async()=>{authCalls++;return {data:{user:providerUser(),session:{}},error:null};}}},
    sessionFence:{beginLogin:()=>late.promise,getSessionWindow,issueSession:async()=>{issues++;return true;}},fenceTimeoutMs:10
  });
  await assert.rejects(pending,error=>error.code==='LOGIN_AUTH_UNAVAILABLE');
  late.resolve(true);await new Promise(resolve=>setTimeout(resolve,20));
  assert.equal(authCalls,0);assert.equal(issues,0);assert.equal(state.directSessionInserts,0);
}));

test('late password-auth completion after timeout cannot issue a session',()=>withSecret(async()=>{
  const late=deferred(),started=deferred(),state=database();
  let issues=0;
  const pending=auth.authenticateAccount({account:'owner-a',password:'123456'},state.db,{
    authClient:{auth:{signInWithPassword:()=>{started.resolve();return late.promise;}}},
    sessionFence:{beginLogin:async()=>true,getSessionWindow,issueSession:async()=>{issues++;return true;}},fenceTimeoutMs:10
  });
  await started.promise;
  await assert.rejects(pending,error=>error.code==='LOGIN_AUTH_TIMEOUT');
  late.resolve({data:{user:providerUser(),session:{}},error:null});
  await new Promise(resolve=>setTimeout(resolve,20));
  assert.equal(issues,0);assert.equal(state.directSessionInserts,0);
}));

test('fresh-profile failure or late completion cannot reach session issue',()=>withSecret(async()=>{
  for(const freshRead of [
    async()=>({data:null,error:{message:'secret database detail'}}),
    async()=>{throw Error('secret database detail');}
  ]){
    const state=database([PROFILE_A,freshRead]);let issues=0;
    await assert.rejects(
      ()=>auth.authenticateAccount({account:'owner-a',password:'123456'},state.db,{
        authClient:{auth:{signInWithPassword:async()=>({data:{user:providerUser(),session:{}},error:null})}},
        sessionFence:{beginLogin:async()=>true,getSessionWindow,issueSession:async()=>{issues++;return true;}}
      }),
      error=>error.code==='LOGIN_AUTH_UNAVAILABLE'&&!error.message.includes('secret')
    );
    assert.equal(issues,0);
  }

  const late=deferred(),state=database([PROFILE_A,()=>late.promise]);let issues=0;
  const pending=auth.authenticateAccount({account:'owner-a',password:'123456'},state.db,{
    authClient:{auth:{signInWithPassword:async()=>({data:{user:providerUser(),session:{}},error:null})}},
    sessionFence:{beginLogin:async()=>true,getSessionWindow,issueSession:async()=>{issues++;return true;}},fenceTimeoutMs:10
  });
  await assert.rejects(pending,error=>error.code==='LOGIN_AUTH_UNAVAILABLE');
  late.resolve({data:{...PROFILE_A},error:null});await new Promise(resolve=>setTimeout(resolve,20));
  assert.equal(issues,0);assert.equal(state.directSessionInserts,0);
}));

test('an ambiguous late issue writes at most once and never returns its token',()=>withSecret(async()=>{
  const late=deferred(),state=database();let issues=0;
  const pending=auth.authenticateAccount({account:'owner-a',password:'123456'},state.db,{
    authClient:{auth:{signInWithPassword:async()=>({data:{user:providerUser(),session:{}},error:null})}},
    sessionFence:{beginLogin:async()=>true,getSessionWindow,issueSession:()=>{issues++;return late.promise;}},fenceTimeoutMs:10
  });
  await assert.rejects(pending,error=>error.code==='LOGIN_AUTH_UNAVAILABLE');
  assert.equal(issues,1);
  late.resolve(true);await new Promise(resolve=>setTimeout(resolve,20));
  assert.equal(issues,1);assert.equal(state.directSessionInserts,0);
}));

test('window dependency failures never issue, insert directly, retry, or count a password failure',()=>withSecret(async()=>{
  const valid=sessionWindow();
  const malformed=[false,null,true,[],{},
    {issuedAt:valid.issuedAt,expiresAt:new Date(Date.parse(valid.expiresAt)-1).toISOString()},
    {issuedAt:valid.issuedAt.replace('Z','+00:00'),expiresAt:valid.expiresAt}];
  for(const value of malformed){
    const state=database();let windows=0,issues=0;
    await assert.rejects(()=>auth.authenticateAccount({account:'owner-a',password:'123456'},state.db,{
      authClient:{auth:{signInWithPassword:async()=>({data:{user:providerUser(),session:{}},error:null})}},
      sessionFence:{beginLogin:async()=>true,getSessionWindow:async()=>{windows++;return value;},issueSession:async()=>{issues++;return true;}}
    }),error=>error.code==='LOGIN_AUTH_UNAVAILABLE');
    assert.equal(windows,1);assert.equal(issues,0);assert.equal(state.failures,0);assert.equal(state.directSessionInserts,0);
  }
  const state=database();let windows=0,issues=0;
  await assert.rejects(()=>auth.authenticateAccount({account:'owner-a',password:'123456'},state.db,{
    authClient:{auth:{signInWithPassword:async()=>({data:{user:providerUser(),session:{}},error:null})}},
    sessionFence:{beginLogin:async()=>true,getSessionWindow:async()=>{windows++;throw Error('secret DB detail');},issueSession:async()=>{issues++;return true;}}
  }),error=>error.code==='LOGIN_AUTH_UNAVAILABLE'&&!error.message.includes('secret'));
  assert.equal(windows,1);assert.equal(issues,0);assert.equal(state.failures,0);assert.equal(state.directSessionInserts,0);
}));

test('window timeout ignores late success and cannot issue a session',()=>withSecret(async()=>{
  const late=deferred(),state=database();let windows=0,issues=0;
  const pending=auth.authenticateAccount({account:'owner-a',password:'123456'},state.db,{
    authClient:{auth:{signInWithPassword:async()=>({data:{user:providerUser(),session:{}},error:null})}},
    sessionFence:{beginLogin:async()=>true,getSessionWindow:()=>{windows++;return late.promise;},issueSession:async()=>{issues++;return true;}},
    fenceTimeoutMs:10
  });
  await assert.rejects(pending,error=>error.code==='LOGIN_AUTH_UNAVAILABLE');
  late.resolve(sessionWindow());await new Promise(resolve=>setTimeout(resolve,20));
  assert.equal(windows,1);assert.equal(issues,0);assert.equal(state.failures,0);assert.equal(state.directSessionInserts,0);
}));

test('token signing completes before the fenced write and expiry is canonical UTC',async()=>{
  const state=database();let issued;
  const previousSecret=process.env.DASHBOARD_SESSION_SECRET;
  const previousServiceKey=process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.DASHBOARD_SESSION_SECRET;delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  try{
    await assert.rejects(
      ()=>auth.createDatabaseSession(PROFILE_A,{},state.db,{
        sessionFence:{beginLogin:async()=>true,getSessionWindow,issueSession:async value=>{issued=value;return true;}},
        ticketId:'30000000-0000-4000-8000-000000000001'
      }),
      /DASHBOARD_SESSION_SECRET/
    );
    assert.equal(issued,undefined);
  }finally{
    if(previousSecret===undefined)delete process.env.DASHBOARD_SESSION_SECRET;else process.env.DASHBOARD_SESSION_SECRET=previousSecret;
    if(previousServiceKey===undefined)delete process.env.SUPABASE_SERVICE_ROLE_KEY;else process.env.SUPABASE_SERVICE_ROLE_KEY=previousServiceKey;
  }

  await withSecret(async()=>{
    const expectedWindow=sessionWindow();
    const result=await auth.createDatabaseSession(PROFILE_A,{
      issuedAt:'client-controlled',expiresAt:'2099-01-01T00:00:00.000Z'
    },state.db,{
      sessionFence:{beginLogin:async()=>true,getSessionWindow:async()=>({...expectedWindow}),issueSession:async value=>{issued=value;return true;}},
      ticketId:'30000000-0000-4000-8000-000000000001'
    });
    assert.equal(issued.expiresAt,expectedWindow.expiresAt);
    assert.match(issued.tokenHash,/^[0-9a-f]{64}$/);
    const payload=JSON.parse(Buffer.from(result.token.split('.')[0],'base64url').toString('utf8'));
    assert.equal(payload.iat,Math.floor(Date.parse(expectedWindow.issuedAt)/1000));
    assert.equal(payload.exp,Math.floor(Date.parse(expectedWindow.expiresAt)/1000));
    assert.equal(payload.exp-payload.iat,43200);
    assert.equal(result.session.expiresAt,new Date(Math.floor(Date.parse(expectedWindow.expiresAt)/1000)*1000).toISOString());
  });
});

function pgliteDashboard(database){
  let directSessionInserts=0;
  function from(table){
    if(!['dashboard_users','dashboard_login_attempts','dashboard_sessions'].includes(table))throw Error(`unexpected table ${table}`);
    let action='select',columns='*';
    const filters=[];
    const builder={
      select(value='*'){action='select';columns=value;return this;},
      delete(){action='delete';return this;},
      update(){throw Error('fenced login must not update dashboard_sessions directly');},
      eq(column,value){filters.push([column,'=',value]);return this;},
      is(column,value){filters.push([column,'is',value]);return this;},
      lt(column,value){filters.push([column,'<',value]);return this;},
      async insert(){directSessionInserts++;throw Error('fenced login must not insert dashboard_sessions directly');},
      async upsert(){throw Error('unexpected failed-login upsert');},
      async maybeSingle(){
        if(!/^[a-z_,*]+$/i.test(columns))throw Error('unsafe test columns');
        const params=[];
        const where=filters.map(([column,operator,value])=>{
          if(!/^[a-z_]+$/i.test(column))throw Error('unsafe test filter');
          if(operator==='is'&&value===null)return `${column} is null`;
          params.push(value);return `${column} ${operator} $${params.length}`;
        }).join(' and ');
        const result=await database.query(`select ${columns} from public.${table}${where?` where ${where}`:''} limit 1`,params);
        return {data:result.rows[0]||null,error:null};
      },
      then(resolve,reject){
        const params=[];
        const where=filters.map(([column,operator,value])=>{
          if(!/^[a-z_]+$/i.test(column))throw Error('unsafe test filter');
          if(operator==='is'&&value===null)return `${column} is null`;
          params.push(value);return `${column} ${operator} $${params.length}`;
        }).join(' and ');
        let query;
        if(action==='delete')query=database.query(`delete from public.${table}${where?` where ${where}`:''}`,params);
        else query=Promise.resolve({rows:[]});
        return query.then(()=>({error:null})).then(resolve,reject);
      }
    };
    return builder;
  }
  return {db:{from},get directSessionInserts(){return directSessionInserts;}};
}

test('actual SQL/store/login use DB expiry when only the app clock is plus or minus five minutes',()=>withSecret(async()=>{
  for(const offsetMs of [300000,-300000]){
    const database=new PGlite();
    try{
      await database.exec('create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create table auth.users(id uuid primary key);');
      await database.exec(await fs.readFile(path.join(__dirname,'../supabase/migrations/20260812182508_add_dashboard_accounts_and_rbac.sql'),'utf8'));
      await database.exec(await fs.readFile(path.join(__dirname,'../lib/tenancy/sql/auth-session-fence.sql'),'utf8'));
      await database.query('insert into auth.users values ($1)',[USER_A]);
      await database.query(`insert into dashboard_users(user_id,email,username,display_name,role)
        values ($1,$2,$3,$4,$5)`,[USER_A,PROFILE_A.email,PROFILE_A.username,PROFILE_A.display_name,PROFILE_A.role]);
      const rpcClient={rpc:async(name,args)=>{
        try{
          const values=Object.values(args);
          const result=await database.query(`select public.${name}(${values.map((_,index)=>`$${index+1}`).join(',')}) as data`,values);
          return {data:result.rows[0].data,error:null};
        }catch(error){
          return {data:null,error:{code:error.code,message:String(error.message).includes('AUTH_TRANSITION_REJECTED')?'AUTH_TRANSITION_REJECTED':error.message}};
        }
      }};
      const actualFence=createAuthSessionStore({rpcClient,timeoutMs:1000});
      let dbWindow;
      const sessionFence={
        beginLogin:value=>actualFence.beginLogin(value),
        async getSessionWindow(value){dbWindow=await actualFence.getSessionWindow(value);return dbWindow;},
        issueSession:value=>actualFence.issueSession(value),
      };
      const isolated=await authWithIndependentAppClock(offsetMs);
      const store=pgliteDashboard(database);
      const dbBefore=(await database.query("select date_trunc('milliseconds',clock_timestamp()) as now")).rows[0].now.getTime();
      const appDelta=isolated.appNow()-dbBefore;
      assert.ok(offsetMs>0 ? appDelta>240000 : appDelta < -240000);
      const result=await isolated.auth.authenticateAccount({account:PROFILE_A.username,password:'123456'},store.db,{
        authClient:{auth:{signInWithPassword:async()=>({data:{user:providerUser(),session:{}},error:null})}},sessionFence
      });
      const dbAfter=(await database.query("select date_trunc('milliseconds',clock_timestamp()) as now")).rows[0].now.getTime();
      assert.ok(Math.abs(dbAfter-Date.now())<5000);
      assert.ok(Date.parse(dbWindow.issuedAt)>=dbBefore&&Date.parse(dbWindow.issuedAt)<=dbAfter);
      assert.equal(Date.parse(dbWindow.expiresAt)-Date.parse(dbWindow.issuedAt),43200000);
      const stored=(await database.query('select expires_at from dashboard_sessions')).rows[0].expires_at.toISOString();
      assert.equal(stored,dbWindow.expiresAt);
      const payload=JSON.parse(Buffer.from(result.token.split('.')[0],'base64url').toString('utf8'));
      assert.equal(payload.iat,Math.floor(Date.parse(dbWindow.issuedAt)/1000));
      assert.equal(payload.exp,Math.floor(Date.parse(dbWindow.expiresAt)/1000));
      assert.equal(payload.exp-payload.iat,43200);
      assert.equal(auth.parseSession(result.token).userId,USER_A);
      assert.equal(store.directSessionInserts,0);
    }finally{await database.close();}
  }
}));

test('real login flow and candidate SQL fence preserve account isolation across reset interleavings',()=>withSecret(async()=>{
  const database=new PGlite();
  try{
    await database.exec('create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create table auth.users(id uuid primary key);');
    await database.exec(await fs.readFile(path.join(__dirname,'../supabase/migrations/20260812182508_add_dashboard_accounts_and_rbac.sql'),'utf8'));
    await database.exec(await fs.readFile(path.join(__dirname,'../lib/tenancy/sql/auth-session-fence.sql'),'utf8'));
    await database.query('insert into auth.users values ($1),($2)',[USER_A,USER_B]);
    await database.query(`insert into dashboard_users(user_id,email,username,display_name,role) values
      ($1,$2,$3,$4,$5),($6,$7,$8,$9,$10)`,[
      USER_A,PROFILE_A.email,PROFILE_A.username,PROFILE_A.display_name,PROFILE_A.role,
      USER_B,PROFILE_B.email,PROFILE_B.username,PROFILE_B.display_name,PROFILE_B.role
    ]);
    const rpcClient={rpc:async(name,args)=>{
      try{
        const values=Object.values(args);
        const result=await database.query(`select public.${name}(${values.map((_,index)=>`$${index+1}`).join(',')}) as data`,values);
        return {data:result.rows[0].data,error:null};
      }catch(error){
        return {data:null,error:{code:error.code,message:String(error.message).includes('AUTH_TRANSITION_REJECTED')?'AUTH_TRANSITION_REJECTED':error.message}};
      }
    }};
    const sessionFence=createAuthSessionStore({rpcClient,timeoutMs:1000});
    const store=pgliteDashboard(database);
    const authClient=user=>({auth:{signInWithPassword:async()=>({data:{user,session:{}},error:null})}});
    const userA=providerUser(),userB=providerUser({id:USER_B,email:PROFILE_B.email});

    const [firstA,firstB]=await Promise.all([
      auth.authenticateAccount({account:PROFILE_A.username,password:'123456'},store.db,{authClient:authClient(userA),sessionFence}),
      auth.authenticateAccount({account:PROFILE_B.username,password:'123456'},store.db,{authClient:authClient(userB),sessionFence})
    ]);
    assert.equal((await auth.validateSession(firstA.token,{db:store.db})).userId,USER_A);
    assert.equal((await auth.validateSession(firstB.token,{db:store.db})).userId,USER_B);

    const delayed=deferred(),authStarted=deferred();
    const pendingA=auth.authenticateAccount({account:PROFILE_A.username,password:'old-password'},store.db,{
      authClient:{auth:{signInWithPassword:()=>{authStarted.resolve();return delayed.promise;}}},sessionFence
    });
    await authStarted.promise;
    const reset='50000000-0000-4000-8000-000000000001';
    await sessionFence.beginPasswordChange({userId:USER_A,operationId:reset});
    await sessionFence.completePasswordChange({userId:USER_A,operationId:reset});
    delayed.resolve({data:{user:userA,session:{}},error:null});
    await assert.rejects(pendingA,error=>error.code==='LOGIN_AUTH_UNAVAILABLE');

    const countUsableSessions=async userId=>(await database.query(`select count(*)::int as count from dashboard_sessions
      where user_id=$1 and revoked_at is null and expires_at>clock_timestamp()`,[userId])).rows[0].count;
    assert.equal(await countUsableSessions(USER_A),0);
    assert.equal(await countUsableSessions(USER_B),1);
    assert.equal(await auth.validateSession(firstA.token,{db:store.db}),null);
    assert.equal((await auth.validateSession(firstB.token,{db:store.db})).userId,USER_B);

    const freshA=await auth.authenticateAccount({account:PROFILE_A.username,password:'new-password'},store.db,{
      authClient:authClient(userA),sessionFence
    });
    assert.equal((await auth.validateSession(freshA.token,{db:store.db})).userId,USER_A);
    assert.equal(await countUsableSessions(USER_A),1);
    assert.equal(await countUsableSessions(USER_B),1);

    let fencedTicket,windows=0;
    const resetAfterWindow='50000000-0000-4000-8000-000000000002';
    await assert.rejects(()=>auth.authenticateAccount({account:PROFILE_A.username,password:'123456'},store.db,{
      authClient:authClient(userA),sessionFence:{
        beginLogin:async value=>{fencedTicket=value.ticketId;return sessionFence.beginLogin(value);},
        getSessionWindow:async value=>{
          windows++;
          const valueFromDb=await sessionFence.getSessionWindow(value);
          await sessionFence.beginPasswordChange({userId:USER_A,operationId:resetAfterWindow});
          await sessionFence.completePasswordChange({userId:USER_A,operationId:resetAfterWindow});
          return valueFromDb;
        },
        issueSession:value=>sessionFence.issueSession(value),
      }
    }),error=>error.code==='LOGIN_AUTH_UNAVAILABLE');
    assert.equal(windows,1);
    assert.equal((await database.query('select consumed from moaon_auth.login_tickets where id=$1',[fencedTicket])).rows[0].consumed,false);
    assert.equal(await countUsableSessions(USER_A),0);
    assert.equal(await countUsableSessions(USER_B),1);
    assert.equal(store.directSessionInserts,0);
  }finally{await database.close();}
}));

test('SQL atomically rejects email, username, or role changes after the verified profile read',()=>withSecret(async()=>{
  const database=new PGlite();
  try{
    await database.exec('create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create table auth.users(id uuid primary key);');
    await database.exec(await fs.readFile(path.join(__dirname,'../supabase/migrations/20260812182508_add_dashboard_accounts_and_rbac.sql'),'utf8'));
    await database.exec(await fs.readFile(path.join(__dirname,'../lib/tenancy/sql/auth-session-fence.sql'),'utf8'));
    const rpcClient={rpc:async(name,args)=>{
      try{
        const values=Object.values(args);
        const result=await database.query(`select public.${name}(${values.map((_,index)=>`$${index+1}`).join(',')}) as data`,values);
        return {data:result.rows[0].data,error:null};
      }catch(error){
        return {data:null,error:{code:error.code,message:String(error.message).includes('AUTH_TRANSITION_REJECTED')?'AUTH_TRANSITION_REJECTED':error.message}};
      }
    }};
    const actualFence=createAuthSessionStore({rpcClient,timeoutMs:1000});
    for(const [column,value] of [
      ['email','changed@example.test'],
      ['username','changed-owner'],
      ['role','VIEWER'],
    ]){
      await database.exec('truncate auth.users cascade;');
      await database.query('insert into auth.users values ($1)',[USER_A]);
      await database.query(`insert into dashboard_users(user_id,email,username,display_name,role)
        values ($1,$2,$3,$4,$5)`,[USER_A,PROFILE_A.email,PROFILE_A.username,PROFILE_A.display_name,PROFILE_A.role]);
      let mutations=0;
      const sessionFence={
        beginLogin:value=>actualFence.beginLogin(value),
        getSessionWindow:value=>actualFence.getSessionWindow(value),
        async issueSession(args){
          mutations++;
          await database.query(`update dashboard_users set ${column}=$1 where user_id=$2`,[value,USER_A]);
          return actualFence.issueSession(args);
        }
      };
      const store=pgliteDashboard(database);
      await assert.rejects(
        ()=>auth.authenticateAccount({account:PROFILE_A.username,password:'123456'},store.db,{
          authClient:{auth:{signInWithPassword:async()=>({data:{user:providerUser(),session:{}},error:null})}},sessionFence
        }),
        error=>error.code==='LOGIN_AUTH_UNAVAILABLE'
      );
      assert.equal(mutations,1);
      assert.equal((await database.query('select count(*)::int as count from dashboard_sessions')).rows[0].count,0);
      assert.equal((await database.query('select consumed from moaon_auth.login_tickets')).rows[0].consumed,false);
      assert.equal(store.directSessionInserts,0);
    }
  }finally{await database.close();}
}));
