'use strict';

const assert=require('node:assert/strict');
const test=require('node:test');
const {createStepUpProviderFixture,tamperJwt,json,USER,SESSION,FACTOR,CHALLENGE}=require('./helpers/step-up-provider-fixture.js');
const {createSupabaseStepUpProvider,StepUpProviderError}=require('../lib/tenancy/supabase-step-up-provider.js');

function assertSanitizedProviderError(error,code,secrets){
  assert.ok(error instanceof StepUpProviderError);
  assert.equal(error.code,code);
  assert.equal(error.status,code==='STEP_UP_REJECTED'?403:503);
  const ownSurface=Reflect.ownKeys(error).map(key=>{try{return `${String(key)}:${String(error[key])}`;}catch{return String(key);}}).join(' ');
  for(const secret of secrets)assert.equal(`${error.message} ${ownSurface}`.includes(secret),false);
  assert.equal(Object.hasOwn(error,'cause'),false);
  return true;
}

test('verified TOTP returns minimal frozen provider evidence and renewed credentials',async()=>{
  const fixture=await createStepUpProviderFixture();
  const provider=createSupabaseStepUpProvider(fixture.config);

  const result=await provider.verifyTotp(fixture.input);

  assert.deepEqual(result.evidence,{
    userId:USER,providerSessionId:SESSION,factorId:FACTOR,method:'mfa',
    verifiedAt:new Date(fixture.totpSeconds*1000).toISOString(),
    expiresAt:new Date(Math.min(fixture.totpSeconds*1000+300_000,fixture.verifiedClaims.exp*1000)).toISOString(),
  });
  assert.deepEqual(result.session,{accessToken:fixture.verifiedJwt,refreshToken:fixture.verifiedRefreshToken});
  assert.deepEqual(Reflect.ownKeys(provider),['verifyTotp']);
  assert.deepEqual(Reflect.ownKeys(result),['evidence','session']);
  assert.deepEqual(Reflect.ownKeys(result.evidence),['userId','providerSessionId','factorId','method','verifiedAt','expiresAt']);
  assert.deepEqual(Reflect.ownKeys(result.session),['accessToken','refreshToken']);
  assert.ok(Object.isFrozen(provider));
  assert.ok(Object.isFrozen(result)&&Object.isFrozen(result.evidence)&&Object.isFrozen(result.session));
  assert.deepEqual(fixture.counts(),{challengeCount:1,verifyCount:1,userCount:3,refreshRequests:0});
  const challenge=fixture.writes[0],verify=fixture.writes[1];
  assert.equal(new URL(challenge.url).pathname,`/auth/v1/factors/${FACTOR}/challenge`);
  assert.equal(challenge.method,'POST');
  assert.deepEqual(JSON.parse(challenge.body),{});
  assert.equal(challenge.headers.authorization,`Bearer ${fixture.accessToken}`);
  assert.equal(challenge.redirect,'error');
  assert.equal(challenge.signal,verify.signal);
  assert.equal(new URL(verify.url).pathname,`/auth/v1/factors/${FACTOR}/verify`);
  assert.equal(verify.method,'POST');
  assert.deepEqual(JSON.parse(verify.body),{code:'123456',challenge_id:CHALLENGE});
  assert.equal(verify.headers.authorization,`Bearer ${fixture.accessToken}`);
});

test('tampered signed token is rejected before any provider write',async()=>{
  const fixture=await createStepUpProviderFixture();
  const provider=createSupabaseStepUpProvider(fixture.config);
  const secretCode='654321';
  const input={...fixture.input,accessToken:tamperJwt(fixture.accessToken),code:secretCode};

  await assert.rejects(()=>provider.verifyTotp(input),error=>assertSanitizedProviderError(error,'STEP_UP_REJECTED',[input.accessToken,fixture.refreshToken,secretCode]));
  assert.equal(fixture.writes.length,0);
});

test('provider, transport, and SDK failures never expose submitted or upstream secrets',async(t)=>{
  await t.test('provider error body',async()=>{
    const providerText='provider-opaque-error-4071';
    const fixture=await createStepUpProviderFixture({challengeStatus:422,challengeResponse:{code:'invalid_totp',message:providerText}});
    const provider=createSupabaseStepUpProvider(fixture.config);
    await assert.rejects(()=>provider.verifyTotp(fixture.input),error=>assertSanitizedProviderError(error,'STEP_UP_REJECTED',[providerText,fixture.accessToken,fixture.refreshToken,fixture.input.code]));
  });
  await t.test('transport exception',async()=>{
    const transportText='transport-exception-opaque-5082';
    const fixture=await createStepUpProviderFixture({onRequest:async request=>{if(new URL(request.url).pathname.endsWith('/jwks.json'))throw new Error(transportText);}});
    const provider=createSupabaseStepUpProvider(fixture.config);
    await assert.rejects(()=>provider.verifyTotp(fixture.input),error=>assertSanitizedProviderError(error,'STEP_UP_UNAVAILABLE',[transportText,fixture.accessToken,fixture.refreshToken,fixture.input.code]));
  });
  await t.test('SDK response exception',async()=>{
    const sdkText='sdk-response-exception-opaque-6193';
    const fixture=await createStepUpProviderFixture({onRequest:async request=>{
      if(!new URL(request.url).pathname.endsWith('/jwks.json'))return undefined;
      const response=new Response('{}',{status:200,headers:{'content-type':'application/json'}});
      Object.defineProperty(response,'json',{value:async()=>{throw new Error(sdkText);}});
      return response;
    }});
    const provider=createSupabaseStepUpProvider(fixture.config);
    await assert.rejects(()=>provider.verifyTotp(fixture.input),error=>assertSanitizedProviderError(error,'STEP_UP_UNAVAILABLE',[sdkText,fixture.accessToken,fixture.refreshToken,fixture.input.code]));
  });
});

test('invalid exact input is a TypeError and performs no network request',async()=>{
  const fixture=await createStepUpProviderFixture();
  const provider=createSupabaseStepUpProvider(fixture.config);
  const invalidInputs=[
    {...fixture.input,extra:true},
    Object.assign({...fixture.input},{[Symbol('extra')]:true}),
    {...fixture.input,userId:'not-a-uuid'},
    {...fixture.input,factorId:'00000000-0000-9000-8000-000000000000'},
    {...fixture.input,accessToken:` ${fixture.accessToken}`},
    {...fixture.input,refreshToken:'x'.repeat(16_385)},
    {...fixture.input,code:'１２３４５６'},
    {...fixture.input,code:'12345'},
  ];
  for(const input of invalidInputs)await assert.rejects(()=>provider.verifyTotp(input),TypeError);
  const throwing={...fixture.input};
  Object.defineProperty(throwing,'code',{enumerable:true,get(){throw new Error(fixture.refreshToken);}});
  await assert.rejects(()=>provider.verifyTotp(throwing),error=>error instanceof TypeError&&!error.message.includes(fixture.refreshToken));
  assert.equal(fixture.requests.length,0);
});

test('configuration and input getters are copied exactly once',async()=>{
  const fixture=await createStepUpProviderFixture();
  const configReads=new Map();
  const config={};
  for(const [key,value] of Object.entries(fixture.config))Object.defineProperty(config,key,{enumerable:true,get(){configReads.set(key,(configReads.get(key)||0)+1);return value;}});
  const provider=createSupabaseStepUpProvider(config);
  assert.deepEqual(Object.fromEntries(configReads),{url:1,publishableKey:1,fetch:1,timeoutMs:1,now:1});
  const inputReads=new Map();
  const input={};
  for(const [key,value] of Object.entries(fixture.input))Object.defineProperty(input,key,{enumerable:true,get(){inputReads.set(key,(inputReads.get(key)||0)+1);return value;}});
  await provider.verifyTotp(input);
  assert.deepEqual(Object.fromEntries(inputReads),{userId:1,accessToken:1,refreshToken:1,factorId:1,code:1});
});

test('factory accepts only canonical server configuration and default clock options',async()=>{
  const fixture=await createStepUpProviderFixture();
  assert.doesNotThrow(()=>createSupabaseStepUpProvider({url:fixture.url,publishableKey:'key',fetch:fixture.config.fetch}));
  const invalid=[
    {...fixture.config,extra:true},
    Object.assign({...fixture.config},{[Symbol('extra')]:true}),
    {...fixture.config,url:`${fixture.url}/`},
    {...fixture.config,url:'http://example.test'},
    {...fixture.config,url:'https://user@example.test'},
    {...fixture.config,publishableKey:' key'},
    {...fixture.config,publishableKey:'x'.repeat(4097)},
    {...fixture.config,fetch:null},
    {...fixture.config,now:null},
    {...fixture.config,timeoutMs:0},
    {...fixture.config,timeoutMs:30_001},
    {...fixture.config,timeoutMs:1.5},
  ];
  for(const config of invalid)assert.throws(()=>createSupabaseStepUpProvider(config),TypeError);
  const provider=createSupabaseStepUpProvider(fixture.config);
  global.window={};global.document={};
  try{
    assert.throws(()=>createSupabaseStepUpProvider(fixture.config),TypeError);
    await assert.rejects(()=>provider.verifyTotp(fixture.input),TypeError);
  }finally{delete global.window;delete global.document;}
});

test('UUID versions 1 through 8 are accepted and normalized to lowercase',async(t)=>{
  for(let version=1;version<=8;version+=1)await t.test(`version ${version}`,async()=>{
    const userId=`aaaaaaaa-aaaa-${version}aaa-8aaa-aaaaaaaaaaaa`;
    const factorId=`bbbbbbbb-bbbb-${version}bbb-8bbb-bbbbbbbbbbbb`;
    const fixture=await createStepUpProviderFixture({userId,factorId});
    const provider=createSupabaseStepUpProvider(fixture.config);
    const result=await provider.verifyTotp({...fixture.input,userId:userId.toUpperCase(),factorId:factorId.toUpperCase()});
    assert.equal(result.evidence.userId,userId);
    assert.equal(result.evidence.factorId,factorId);
  });
});

test('signed original claim policy mismatches are rejected before provider writes',async(t)=>{
  const current=Date.now();
  const cases=[
    ['issuer',{iss:'https://other.example/auth/v1'}],
    ['audience',{aud:'anon'}],
    ['role',{role:'anon'}],
    ['subject',{sub:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'}],
    ['anonymous',{is_anonymous:true}],
    ['future iat',{iat:Math.floor(current/1000)+1}],
    ['future nbf',{nbf:Math.floor(current/1000)+1}],
    ['short lifetime',{exp:Math.floor(current/1000)+90}],
  ];
  for(const [name,claims] of cases)await t.test(name,async()=>{
    const fixture=await createStepUpProviderFixture({nowMs:current,originalClaims:claims});
    const provider=createSupabaseStepUpProvider(fixture.config);
    await assert.rejects(()=>provider.verifyTotp(fixture.input),error=>error.code==='STEP_UP_REJECTED');
    assert.equal(fixture.writes.length,0);
  });
  for(const [name,claims] of [['malformed numeric claim',{iat:'bad'}],['malformed session claim',{session_id:'not-a-uuid'}]])await t.test(name,async()=>{
      const fixture=await createStepUpProviderFixture({nowMs:current,originalClaims:claims});
      const provider=createSupabaseStepUpProvider(fixture.config);
      await assert.rejects(()=>provider.verifyTotp(fixture.input),error=>error.code==='STEP_UP_UNAVAILABLE');
      assert.equal(fixture.writes.length,0);
    });
});

test('authoritative user and selected factor policy is enforced before challenge',async(t)=>{
  const current=Date.now();
  const rejectedCases=[
    ['unconfirmed email',{email_confirmed_at:null}],
    ['different user',{id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'}],
    ['anonymous user',{is_anonymous:true}],
    ['deleted user',{deleted_at:new Date(current-1000).toISOString()}],
    ['banned user',{banned_until:new Date(current+60_000).toISOString()}],
    ['missing factor',{factors:[]}],
    ['duplicate factor',{factors:[{id:FACTOR,factor_type:'totp',status:'verified'},{id:FACTOR,factor_type:'totp',status:'verified'}]}],
    ['phone factor',{factors:[{id:FACTOR,factor_type:'phone',status:'verified'}]}],
    ['unverified factor',{factors:[{id:FACTOR,factor_type:'totp',status:'unverified'}]}],
  ];
  for(const [name,originalUser] of rejectedCases)await t.test(name,async()=>{
    const fixture=await createStepUpProviderFixture({nowMs:current,originalUser});
    const provider=createSupabaseStepUpProvider(fixture.config);
    await assert.rejects(()=>provider.verifyTotp(fixture.input),error=>error.code==='STEP_UP_REJECTED');
    assert.equal(fixture.writes.length,0);
  });
  await t.test('malformed factor response',async()=>{
    const fixture=await createStepUpProviderFixture({nowMs:current,originalUser:{factors:[null]}});
    const provider=createSupabaseStepUpProvider(fixture.config);
    await assert.rejects(()=>provider.verifyTotp(fixture.input),error=>error.code==='STEP_UP_UNAVAILABLE');
  });
});

test('challenge response and HTTP failures are classified without a verify retry',async(t)=>{
  const cases=[
    ['invalid challenge id',{challengeResponse:{id:'bad',type:'totp',expires_at:Math.floor(Date.now()/1000)+60}},'STEP_UP_UNAVAILABLE'],
    ['wrong challenge type',{challengeResponse:{id:CHALLENGE,type:'phone',expires_at:Math.floor(Date.now()/1000)+60}},'STEP_UP_UNAVAILABLE'],
    ['expired challenge',{challengeResponse:{id:CHALLENGE,type:'totp',expires_at:Math.floor(Date.now()/1000)-1}},'STEP_UP_REJECTED'],
    ['malformed challenge JSON',{malformedChallenge:true},'STEP_UP_UNAVAILABLE'],
    ['challenge 422',{challengeStatus:422},'STEP_UP_REJECTED'],
    ['challenge 429',{challengeStatus:429},'STEP_UP_UNAVAILABLE'],
    ['challenge 503',{challengeStatus:503},'STEP_UP_UNAVAILABLE'],
  ];
  for(const [name,options,code] of cases)await t.test(name,async()=>{
    const fixture=await createStepUpProviderFixture(options);
    const provider=createSupabaseStepUpProvider(fixture.config);
    await assert.rejects(()=>provider.verifyTotp(fixture.input),error=>error.code===code);
    assert.equal(fixture.counts().challengeCount,1);
    assert.equal(fixture.counts().verifyCount,0);
  });
});

test('verification failures are classified and attempted only once',async(t)=>{
  const cases=[
    ['wrong OTP',{verifyStatus:422},'STEP_UP_REJECTED'],
    ['verify 401',{verifyStatus:401},'STEP_UP_REJECTED'],
    ['verify 429',{verifyStatus:429},'STEP_UP_UNAVAILABLE'],
    ['verify 503',{verifyStatus:503},'STEP_UP_UNAVAILABLE'],
    ['malformed verify JSON',{malformedVerify:true},'STEP_UP_UNAVAILABLE'],
    ['missing renewed token',{verifyResponse:({defaultVerify})=>({...defaultVerify,access_token:''})},'STEP_UP_UNAVAILABLE'],
    ['malformed expiry',{verifyResponse:({defaultVerify})=>({...defaultVerify,expires_in:'600'})},'STEP_UP_UNAVAILABLE'],
  ];
  for(const [name,options,code] of cases)await t.test(name,async()=>{
    const fixture=await createStepUpProviderFixture(options);
    const provider=createSupabaseStepUpProvider(fixture.config);
    await assert.rejects(()=>provider.verifyTotp(fixture.input),error=>error.code===code);
    assert.deepEqual(fixture.counts(),{challengeCount:1,verifyCount:1,userCount:2,refreshRequests:0});
  });
});

test('renewed signed claims must preserve identity and carry fresh aal2 TOTP evidence',async(t)=>{
  const current=Date.now();
  const issued=Math.floor(current/1000)-30;
  const cases=[
    ['different subject',{sub:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'},'STEP_UP_REJECTED'],
    ['different session',{session_id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'},'STEP_UP_REJECTED'],
    ['aal1',{aal:'aal1'},'STEP_UP_REJECTED'],
    ['missing TOTP',{amr:[{method:'password',timestamp:issued}]},'STEP_UP_REJECTED'],
    ['old TOTP',{amr:[{method:'totp',timestamp:Math.floor(current/1000)-301}]},'STEP_UP_REJECTED'],
    ['future TOTP',{amr:[{method:'totp',timestamp:Math.floor(current/1000)+1}]},'STEP_UP_REJECTED'],
    ['malformed AMR',{amr:[{method:'totp',timestamp:'bad'}]},'STEP_UP_UNAVAILABLE'],
    ['malformed renewed claim',{role:7},'STEP_UP_UNAVAILABLE'],
  ];
  for(const [name,verifiedClaims,code] of cases)await t.test(name,async()=>{
    const fixture=await createStepUpProviderFixture({nowMs:current,verifiedClaims});
    const provider=createSupabaseStepUpProvider(fixture.config);
    await assert.rejects(()=>provider.verifyTotp(fixture.input),error=>error.code===code);
    assert.equal(fixture.counts().verifyCount,1);
  });
  await t.test('tampered renewed token',async()=>{
    const fixture=await createStepUpProviderFixture({nowMs:current,verifyResponse:({defaultVerify,verifiedJwt})=>({...defaultVerify,access_token:tamperJwt(verifiedJwt)})});
    const provider=createSupabaseStepUpProvider(fixture.config);
    await assert.rejects(()=>provider.verifyTotp(fixture.input),error=>error.code==='STEP_UP_REJECTED');
    assert.equal(fixture.counts().verifyCount,1);
  });
});

test('fresh user checks reject identity changes and ignore the verify body user',async(t)=>{
  await t.test('original fresh user changed',async()=>{
    const fixture=await createStepUpProviderFixture({userResponse:(count,user)=>count===2?{...user,email:'changed@example.test'}:user});
    const provider=createSupabaseStepUpProvider(fixture.config);
    await assert.rejects(()=>provider.verifyTotp(fixture.input),error=>error.code==='STEP_UP_REJECTED');
    assert.equal(fixture.writes.length,0);
  });
  await t.test('renewed fresh user changed',async()=>{
    const fixture=await createStepUpProviderFixture({userResponse:(count,user)=>count===3?{...user,email:'changed@example.test'}:user});
    const provider=createSupabaseStepUpProvider(fixture.config);
    await assert.rejects(()=>provider.verifyTotp(fixture.input),error=>error.code==='STEP_UP_REJECTED');
    assert.equal(fixture.counts().verifyCount,1);
  });
  await t.test('renewed selected factor changed',async()=>{
    const fixture=await createStepUpProviderFixture({verifiedUser:{factors:[]}});
    const provider=createSupabaseStepUpProvider(fixture.config);
    await assert.rejects(()=>provider.verifyTotp(fixture.input),error=>error.code==='STEP_UP_REJECTED');
    assert.equal(fixture.counts().verifyCount,1);
  });
  await t.test('verify response body user is not authority',async()=>{
    const fixture=await createStepUpProviderFixture({verifyResponse:({defaultVerify})=>({...defaultVerify,user:{id:'attacker'}})});
    const provider=createSupabaseStepUpProvider(fixture.config);
    const result=await provider.verifyTotp(fixture.input);
    assert.equal(result.evidence.userId,fixture.input.userId);
    assert.equal(fixture.counts().userCount,3);
  });
});

test('authoritative user HTTP and malformed responses are normalized',async(t)=>{
  const cases=[
    ['user 401',{userStatus:()=>401},'STEP_UP_REJECTED'],
    ['user 429',{userStatus:()=>429},'STEP_UP_UNAVAILABLE'],
    ['user 503',{userStatus:()=>503},'STEP_UP_UNAVAILABLE'],
    ['malformed user JSON',{malformedUserAt:1},'STEP_UP_UNAVAILABLE'],
    ['invalid confirmed timestamp',{originalUser:{email_confirmed_at:'not-a-date'}},'STEP_UP_UNAVAILABLE'],
    ['invalid banned timestamp',{originalUser:{banned_until:'not-a-date'}},'STEP_UP_UNAVAILABLE'],
    ['malformed deleted marker',{originalUser:{deleted_at:{}}},'STEP_UP_UNAVAILABLE'],
  ];
  for(const [name,options,code] of cases)await t.test(name,async()=>{
    const fixture=await createStepUpProviderFixture(options);
    const provider=createSupabaseStepUpProvider(fixture.config);
    await assert.rejects(()=>provider.verifyTotp(fixture.input),error=>error.code===code);
    assert.equal(fixture.writes.length,0);
  });
});

test('JWKS and malformed token failures are unavailable without provider writes',async(t)=>{
  const cases=[
    ['malformed JWKS',{malformedJwks:true}],
    ['JWKS 503',{jwksStatus:503}],
  ];
  for(const [name,options] of cases)await t.test(name,async()=>{
    const fixture=await createStepUpProviderFixture(options);
    const provider=createSupabaseStepUpProvider(fixture.config);
    await assert.rejects(()=>provider.verifyTotp(fixture.input),error=>error.code==='STEP_UP_UNAVAILABLE');
    assert.equal(fixture.writes.length,0);
  });
  await t.test('malformed JWT structure',async()=>{
    const fixture=await createStepUpProviderFixture();
    const provider=createSupabaseStepUpProvider(fixture.config);
    await assert.rejects(()=>provider.verifyTotp({...fixture.input,accessToken:'not.a.jwt'}),error=>error.code==='STEP_UP_UNAVAILABLE');
    assert.equal(fixture.requests.length,0);
  });
});

test('supplied clock controls evidence and the JWT expiry caps it',async()=>{
  const nowMs=Date.now()+10_000;
  const totpSeconds=Math.floor(nowMs/1000);
  const verifiedExp=Math.floor(nowMs/1000)+120;
  const fixture=await createStepUpProviderFixture({nowMs,verifiedClaims:{exp:verifiedExp,amr:[{method:'totp',timestamp:totpSeconds}]}});
  const result=await createSupabaseStepUpProvider(fixture.config).verifyTotp(fixture.input);
  assert.equal(result.evidence.verifiedAt,new Date(totpSeconds*1000).toISOString());
  assert.equal(result.evidence.expiresAt,new Date(verifiedExp*1000).toISOString());
});

test('clock rollback and deadline crossings prevent later HTTP dispatch',async(t)=>{
  await t.test('rollback while JWKS is in flight',async()=>{
    let fixture;
    fixture=await createStepUpProviderFixture({onRequest:async request=>{if(new URL(request.url).pathname.endsWith('/jwks.json'))fixture.clock.value-=1;}});
    const provider=createSupabaseStepUpProvider(fixture.config);
    await assert.rejects(()=>provider.verifyTotp(fixture.input),error=>error.code==='STEP_UP_UNAVAILABLE');
    assert.equal(fixture.requests.length,1);
    assert.equal(fixture.writes.length,0);
  });
  await t.test('deadline after fresh user prevents challenge',async()=>{
    let fixture;
    fixture=await createStepUpProviderFixture({onRequest:async request=>{if(new URL(request.url).pathname==='/auth/v1/user'&&fixture.counts().userCount===1)fixture.clock.value+=500;}});
    const provider=createSupabaseStepUpProvider(fixture.config);
    await assert.rejects(()=>provider.verifyTotp(fixture.input),error=>error.code==='STEP_UP_UNAVAILABLE');
    assert.equal(fixture.writes.length,0);
  });
  await t.test('deadline after challenge prevents verify',async()=>{
    let fixture;
    fixture=await createStepUpProviderFixture({onRequest:async request=>{if(new URL(request.url).pathname.endsWith('/challenge'))fixture.clock.value+=500;}});
    const provider=createSupabaseStepUpProvider(fixture.config);
    await assert.rejects(()=>provider.verifyTotp(fixture.input),error=>error.code==='STEP_UP_UNAVAILABLE');
    await new Promise(resolve=>setTimeout(resolve,10));
    assert.equal(fixture.counts().challengeCount,1);
    assert.equal(fixture.counts().verifyCount,0);
  });
  await t.test('non-primitive clock fails before network',async()=>{
    const fixture=await createStepUpProviderFixture({now:()=>new Number(Date.now())});
    const provider=createSupabaseStepUpProvider(fixture.config);
    await assert.rejects(()=>provider.verifyTotp(fixture.input),error=>error.code==='STEP_UP_UNAVAILABLE');
    assert.equal(fixture.requests.length,0);
  });
});

test('late challenge response is not approved and cannot dispatch verify',async()=>{
  let fixture;
  fixture=await createStepUpProviderFixture({onRequest:async request=>{
    if(new URL(request.url).pathname.endsWith('/challenge'))await new Promise(resolve=>setTimeout(resolve,70));
  }});
  const provider=createSupabaseStepUpProvider({...fixture.config,timeoutMs:20});
  await assert.rejects(()=>provider.verifyTotp(fixture.input),error=>error.code==='STEP_UP_UNAVAILABLE');
  await new Promise(resolve=>setTimeout(resolve,90));
  assert.equal(fixture.requests.filter(request=>new URL(request.url).pathname.endsWith('/challenge')).length,1);
  assert.equal(fixture.counts().verifyCount,0);
});

test('SDK implicit refresh is blocked before the injected transport and is not retried',async()=>{
  const actual=Date.now();
  const supplied=actual-200_000;
  const fixture=await createStepUpProviderFixture({
    nowMs:supplied,
    originalClaims:{iat:Math.floor(supplied/1000)-30,exp:Math.floor(actual/1000)+1},
    onRequest:async request=>{if(new URL(request.url).pathname.endsWith('/jwks.json'))await new Promise(resolve=>setTimeout(resolve,1_200));},
  });
  const provider=createSupabaseStepUpProvider({...fixture.config,timeoutMs:2_000});
  await assert.rejects(()=>provider.verifyTotp(fixture.input),error=>error.code==='STEP_UP_UNAVAILABLE');
  assert.equal(fixture.counts().refreshRequests,0);
  assert.equal(fixture.requests.filter(request=>new URL(request.url).pathname==='/auth/v1/token').length,0);
  assert.equal(fixture.writes.length,0);
});

test('concurrent users keep tokens, factors, and renewed sessions isolated',async()=>{
  const nowMs=Date.now();
  const url=`https://concurrent-${Math.random().toString(36).slice(2)}.example`;
  const first=await createStepUpProviderFixture({url,nowMs,userId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',sessionId:'cccccccc-cccc-4ccc-8ccc-cccccccccccc',factorId:'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',challengeId:'11111111-1111-4111-8111-111111111111'});
  const second=await createStepUpProviderFixture({url,nowMs,userId:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',sessionId:'dddddddd-dddd-4ddd-8ddd-dddddddddddd',factorId:'ffffffff-ffff-4fff-8fff-ffffffffffff',challengeId:'22222222-2222-4222-8222-222222222222'});
  const combinedFetch=async(input,init={})=>{
    const path=new URL(String(input)).pathname;
    if(path==='/auth/v1/.well-known/jwks.json')return json({keys:[{...first.publicJwk,kid:first.kid,alg:'ES256',use:'sig'},{...second.publicJwk,kid:second.kid,alg:'ES256',use:'sig'}]});
    if(path.includes(first.input.factorId))return first.config.fetch(input,init);
    if(path.includes(second.input.factorId))return second.config.fetch(input,init);
    const authorization=new Headers(init.headers).get('authorization');
    if([first.accessToken,first.verifiedJwt].some(token=>authorization===`Bearer ${token}`))return first.config.fetch(input,init);
    if([second.accessToken,second.verifiedJwt].some(token=>authorization===`Bearer ${token}`))return second.config.fetch(input,init);
    return json({message:'mixed concurrent credential'},500);
  };
  const provider=createSupabaseStepUpProvider({url,publishableKey:'test-key',fetch:combinedFetch,timeoutMs:500,now:()=>nowMs});
  const [one,two]=await Promise.all([provider.verifyTotp(first.input),provider.verifyTotp(second.input)]);
  assert.deepEqual([one.evidence.userId,two.evidence.userId],[first.input.userId,second.input.userId]);
  assert.deepEqual([one.evidence.providerSessionId,two.evidence.providerSessionId],[first.originalClaims.session_id,second.originalClaims.session_id]);
  assert.deepEqual([one.session.accessToken,two.session.accessToken],[first.verifiedJwt,second.verifiedJwt]);
  assert.deepEqual(first.counts(),{challengeCount:1,verifyCount:1,userCount:3,refreshRequests:0});
  assert.deepEqual(second.counts(),{challengeCount:1,verifyCount:1,userCount:3,refreshRequests:0});
});
