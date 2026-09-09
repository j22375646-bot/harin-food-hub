const test=require('node:test'),assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
const path=require('node:path');
const {readCredentialReadiness}=require('../lib/tenancy/credential-readiness.js');
const {HARIN_ORIGIN}=require('../desktop/connection-policy.cjs');
const valid=()=>({MOAON_CREDENTIAL_SAVE_ENABLED:'0',MOAON_CREDENTIAL_SAVE_ORIGIN:HARIN_ORIGIN,MOAON_CREDENTIAL_SAVE_INGRESS:'vercel-direct',MOAON_CREDENTIAL_KEYRING:JSON.stringify({private_key_id:Buffer.alloc(32,7).toString('base64')}),MOAON_CREDENTIAL_ACTIVE_KEY_ID:'private_key_id',MOAON_CREDENTIAL_ADMISSION_HMAC_KEY:'private-hmac-'.repeat(8),MOAON_CONTROL_DB_HOST:'private-db.example.test',MOAON_CONTROL_DB_PORT:'5432',MOAON_CONTROL_DB_NAME:'private_database',MOAON_CONTROL_DB_PASSWORD:'private-password',SUPABASE_URL:'https://private-identity.example.test',SUPABASE_SERVICE_ROLE_KEY:'private-service-key',VERCEL:'1',VERCEL_ENV:'production'});
const check=(report,code)=>report.checks.find(item=>item.code===code)?.status;
test('disabled valid candidate is validated without activation and never attests operations',()=>{
 const env=Object.freeze(valid()),before=JSON.stringify(env),report=readCredentialReadiness(env);
 assert.equal(report.status,'CONFIGURATION_VALID_REQUIRES_OPERATIONS');assert.equal(report.activation,'DISABLED');assert.equal(JSON.stringify(env),before);
 assert.ok(report.checks.every(item=>item.status==='VALID'));assert.deepEqual(report.operationalChecks.map(x=>x.code),['DATABASE_ACL','DATABASE_SCHEMA','SESSION_FENCES','QUOTA','INGRESS','OWNER_POLICY','KEY_CUSTODY','PLATFORM_AUTHENTICATION']);assert.ok(report.operationalChecks.every(x=>x.status==='UNVERIFIED'));
 const output=JSON.stringify(report);for(const value of ['private_key_id','private-hmac','private-db','private_database','private-password','private-identity','private-service',HARIN_ORIGIN])assert.equal(output.includes(value),false);
 assert.equal(readCredentialReadiness({...env,MOAON_CREDENTIAL_SAVE_ENABLED:'1'}).activation,'ENABLED');
});
test('missing groups are separate, partial and malformed candidates remain blocked even disabled',()=>{
 const missing=readCredentialReadiness({});assert.equal(missing.status,'BLOCKED');assert.equal(missing.activation,'DISABLED');for(const code of ['CREDENTIAL_CONFIG','CONTROL_DATABASE_CONFIG','IDENTITY_CONFIG','VERCEL_RUNTIME','DESKTOP_ORIGIN'])assert.equal(check(missing,code),'MISSING');
 for(const changes of [{MOAON_CREDENTIAL_SAVE_ENABLED:'yes'},{MOAON_CREDENTIAL_KEYRING:'private-malformed-secret'},{MOAON_CREDENTIAL_ACTIVE_KEY_ID:'wrong'},{MOAON_CONTROL_DB_PORT:'abc'},{MOAON_CONTROL_DB_PASSWORD:''},{SUPABASE_URL:'http://unsafe.test'},{SUPABASE_SERVICE_ROLE_KEY:''},{VERCEL_ENV:'preview'},{VERCEL:'0'},{MOAON_CREDENTIAL_SAVE_ORIGIN:'https://other.example.test'}]){
  const report=readCredentialReadiness({...valid(),...changes});assert.equal(report.status,'BLOCKED');assert.doesNotMatch(JSON.stringify(report),/private-|unsafe|other\.example|wrong/);
 }
 assert.equal(check(readCredentialReadiness({MOAON_CONTROL_DB_HOST:'partial.example'}),'CONTROL_DATABASE_CONFIG'),'INVALID');
});
test('CLI fixed safe JSON and exit semantics; no arbitrary flags or operational override',()=>{
 const cli=path.join(__dirname,'../scripts/check-moaon-credential-readiness.js');
 for(const [env,args,exit] of [[valid(),[],0],[{},[],1],[valid(),['--origin=https://other.example'],1],[valid(),['--operations-verified'],1]]){
  const result=spawnSync(process.execPath,[cli,...args],{env:{SystemRoot:process.env.SystemRoot,TEMP:process.env.TEMP,TMP:process.env.TMP,...env},encoding:'utf8',timeout:10000,windowsHide:true});assert.equal(result.status,exit,result.stderr);assert.equal(result.stderr,'');const report=JSON.parse(result.stdout);assert.notEqual(report.status,'READY');assert.doesNotMatch(result.stdout,/private-|https:|other\.example/);assert.ok(report.operationalChecks.every(x=>x.status==='UNVERIFIED'));
 }
});
test('import and validation cannot construct DB/auth clients or fetch, and leave process env unchanged',()=>{
 const target=path.join(__dirname,'../lib/tenancy/credential-readiness.js');
 const script=`const assert=require('node:assert/strict');const before=JSON.stringify(process.env);const Module=require('node:module');const load=Module._load;let calls=0;const forbidden=()=>{calls++;throw Error('private-network-error');};global.fetch=forbidden;Module._load=function(name,...rest){if(name==='pg')return {Pool:forbidden};if(name==='@supabase/supabase-js')return {createClient:forbidden};return load.call(this,name,...rest);};const result=require(${JSON.stringify(target)}).readCredentialReadiness(process.env);assert.equal(result.status,'CONFIGURATION_VALID_REQUIRES_OPERATIONS');assert.equal(calls,0);assert.equal(JSON.stringify(process.env),before);process.stdout.write('PASS');`;
 const result=spawnSync(process.execPath,['-e',script],{env:{SystemRoot:process.env.SystemRoot,TEMP:process.env.TEMP,TMP:process.env.TMP,...valid()},encoding:'utf8',timeout:10000,windowsHide:true});assert.equal(result.status,0,result.stderr);assert.equal(result.stdout,'PASS');
});
test('CLI ignores cwd .env files and reports only missing group codes',()=>{
 const fs=require('node:fs');const temp=fs.mkdtempSync(path.join(require('node:os').tmpdir(),'p461o-preflight-'));const file=path.join(temp,'.env');
 try{
  fs.writeFileSync(file,Object.entries(valid()).map(([key,value])=>key+'='+value).join('\n'));
  const result=spawnSync(process.execPath,[path.join(__dirname,'../scripts/check-moaon-credential-readiness.js')],{cwd:temp,env:{SystemRoot:process.env.SystemRoot,TEMP:process.env.TEMP,TMP:process.env.TMP},encoding:'utf8',timeout:10000,windowsHide:true});assert.equal(result.status,1);const report=JSON.parse(result.stdout);assert.equal(report.status,'BLOCKED');assert.ok(report.checks.every(x=>x.status==='MISSING'));assert.equal(result.stderr,'');
 }finally{fs.unlinkSync(file);fs.rmdirSync(temp);}
});
test('accessor input is rejected without executing getters or returning their secret errors',()=>{
 let accessed=0;const env={...valid()};Object.defineProperty(env,'MOAON_CREDENTIAL_KEYRING',{get(){accessed++;throw Error('private-accessor-secret');}});
 const report=readCredentialReadiness(env);assert.equal(report.status,'BLOCKED');assert.equal(accessed,0);assert.doesNotMatch(JSON.stringify(report),/private/);
});
