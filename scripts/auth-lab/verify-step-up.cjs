'use strict';

const crypto=require('node:crypto');
const fs=require('node:fs');
const {createClient}=require('@supabase/supabase-js');
const {createSupabaseStepUpProvider}=require('../../lib/tenancy/supabase-step-up-provider.js');
const {
  LAB_ORIGIN,
  createPinnedFetch,
  nextTotpWaitMs,
  readLabConfiguration,
  startTlsGateway,
  tamperJwtSignature,
  totpCode,
  validateLogoutRefreshRevocation,
}=require('./auth-lab-utils.cjs');

const LAB_PUBLIC_KEY='moaon-auth-lab-local-publishable-key';

function check(name,count=1){process.stdout.write(`CHECK ${name} PASS ${count}\n`);}
function fail(name){process.stdout.write(`CHECK ${name} FAIL 1\n`);}
function required(value){if(!value)throw new Error('AUTH_LAB_CHECK_FAILED');return value;}
function claims(token){
  const parts=String(token).split('.');
  if(parts.length!==3)throw new Error('AUTH_LAB_CHECK_FAILED');
  return JSON.parse(Buffer.from(parts[1],'base64url').toString('utf8'));
}
function differentCode(code){return String((Number(code)+1)%1_000_000).padStart(6,'0');}
async function rejected(operation){
  try{await operation();}catch(error){if(error?.code==='STEP_UP_REJECTED')return;}
  throw new Error('AUTH_LAB_CHECK_FAILED');
}
async function delay(milliseconds){await new Promise(resolve=>setTimeout(resolve,milliseconds));}

async function run(){
  let configuration;
  try{configuration=readLabConfiguration(process.env);}catch{fail('opt-in');process.exitCode=1;return;}

  let gateway;
  let client;
  try{
    const cert=fs.readFileSync(configuration.certPath);
    const key=fs.readFileSync(configuration.keyPath);
    const requests=[];
    gateway=await startTlsGateway({cert,key});
    const pinnedFetch=createPinnedFetch({ca:cert,onRequest:event=>requests.push(event)});
    client=createClient(LAB_ORIGIN,LAB_PUBLIC_KEY,{auth:{autoRefreshToken:false,persistSession:false,detectSessionInUrl:false},global:{fetch:pinnedFetch}});

    const suffix=crypto.randomBytes(10).toString('hex');
    const email=`auth-lab-${suffix}@example.invalid`;
    const password=crypto.randomBytes(32).toString('base64url');
    const signup=await client.auth.signUp({email,password});
    const signupUser=required(!signup.error&&signup.data?.user);
    check('signup');

    const login=await client.auth.signInWithPassword({email,password});
    const loginUser=required(!login.error&&login.data?.user);
    required(loginUser.id===signupUser.id&&login.data?.session?.access_token&&login.data?.session?.refresh_token);
    check('login');

    const enrollment=await client.auth.mfa.enroll({factorType:'totp',friendlyName:`auth-lab-${suffix}`});
    const factorId=required(!enrollment.error&&enrollment.data?.id);
    const secret=required(enrollment.data?.totp?.secret);
    check('enroll');

    const firstCounter=Math.floor(Date.now()/30_000);
    const firstVerification=await client.auth.mfa.challengeAndVerify({factorId,code:totpCode(secret)});
    required(!firstVerification.error);
    check('first-totp');

    const waitMs=nextTotpWaitMs(Date.now(),firstCounter);
    process.stdout.write(`CHECK next-totp-wait START ${waitMs}\n`);
    await delay(waitMs);
    check('next-totp-wait',waitMs);

    const freshLogin=await client.auth.signInWithPassword({email,password});
    const sourceSession=required(!freshLogin.error&&freshLogin.data?.session);
    required(freshLogin.data?.user?.id===signupUser.id);
    const validCode=totpCode(secret);
    const provider=createSupabaseStepUpProvider({url:LAB_ORIGIN,publishableKey:LAB_PUBLIC_KEY,fetch:pinnedFetch,timeoutMs:30_000});
    const providerStart=requests.length;

    await rejected(()=>provider.verifyTotp({
      userId:signupUser.id,accessToken:sourceSession.access_token,refreshToken:sourceSession.refresh_token,
      factorId,code:differentCode(validCode),
    }));
    check('wrong-code-rejected');

    await rejected(()=>provider.verifyTotp({
      userId:signupUser.id,accessToken:tamperJwtSignature(sourceSession.access_token),refreshToken:sourceSession.refresh_token,
      factorId,code:validCode,
    }));
    check('tampered-token-rejected');

    let otherUserId=crypto.randomUUID();
    if(otherUserId===signupUser.id)otherUserId=crypto.randomUUID();
    await rejected(()=>provider.verifyTotp({
      userId:otherUserId,accessToken:sourceSession.access_token,refreshToken:sourceSession.refresh_token,
      factorId,code:validCode,
    }));
    check('other-user-rejected');

    const verified=await provider.verifyTotp({
      userId:signupUser.id,accessToken:sourceSession.access_token,refreshToken:sourceSession.refresh_token,
      factorId,code:totpCode(secret),
    });
    const sourceClaims=claims(sourceSession.access_token);
    const renewedClaims=claims(verified.session.accessToken);
    required(verified.evidence.userId===signupUser.id&&verified.evidence.factorId===factorId&&
      verified.evidence.providerSessionId===sourceClaims.session_id&&renewedClaims.session_id===sourceClaims.session_id&&
      verified.evidence.method==='mfa');
    const verifiedAt=Date.parse(verified.evidence.verifiedAt);
    const expiresAt=Date.parse(verified.evidence.expiresAt);
    required(Number.isFinite(verifiedAt)&&Number.isFinite(expiresAt)&&expiresAt>verifiedAt&&expiresAt<=verifiedAt+300_000&&
      Object.isFrozen(verified)&&Object.isFrozen(verified.evidence)&&Object.isFrozen(verified.session));
    check('success-evidence',6);

    const providerRequests=requests.slice(providerStart);
    const providerRefreshes=providerRequests.filter(event=>event.path.startsWith('/auth/v1/token?')&&event.path.includes('grant_type=refresh_token'));
    required(providerRefreshes.length===0);
    check('provider-refresh-unused',providerRefreshes.length);

    const setVerified=await client.auth.setSession({access_token:verified.session.accessToken,refresh_token:verified.session.refreshToken});
    required(!setVerified.error);
    const revocationStart=requests.length;
    const logout=await client.auth.signOut({scope:'global'});
    const refresh=await client.auth.refreshSession({refresh_token:verified.session.refreshToken});
    validateLogoutRefreshRevocation({requests:requests.slice(revocationStart),logout,refresh});
    check('logout-refresh-rejected');

    for(const event of requests)process.stdout.write(`REQUEST ${event.method} ${event.path} ${event.status}\n`);
    check('requests',requests.length);
  }catch{
    fail('harness');
    process.exitCode=1;
  }finally{
    client?.auth?.stopAutoRefresh();
    if(gateway)try{await gateway.close();}catch{process.exitCode=1;}
  }
}

run();
