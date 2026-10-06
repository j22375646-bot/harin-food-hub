'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
let createCredentialCipher;try{({createCredentialCipher}=require('../lib/tenancy/credential-envelope.js'));}catch(e){if(e.code!=='MODULE_NOT_FOUND')throw e;}
const scope={tenantId:'11111111-1111-4111-8111-111111111111',provider:'NAVER',revision:1};
const key=Buffer.alloc(32,7).toString('base64');
test('credentials are encrypted nondeterministically and recover only within their exact scope',()=>{
 assert.equal(typeof createCredentialCipher,'function');const cipher=createCredentialCipher({activeKeyId:'v1',keys:{v1:key}});
 const a=cipher.seal(scope,{clientId:'test',clientSecret:'secret-test'}),b=cipher.seal(scope,{clientId:'test',clientSecret:'secret-test'});
 assert.notEqual(a.ciphertext,b.ciphertext);assert.doesNotMatch(JSON.stringify(a),/secret-test/);
 assert.deepEqual(cipher.open(scope,a),{clientId:'test',clientSecret:'secret-test'});
 for(const changed of [{...scope,provider:'COUPANG'},{...scope,revision:2},{...scope,tenantId:'22222222-2222-4222-8222-222222222222'}])assert.throws(()=>cipher.open(changed,a),/CREDENTIAL_UNAVAILABLE/);
});
test('tampering, missing keys and malformed envelopes fail closed',()=>{
 assert.equal(typeof createCredentialCipher,'function');const cipher=createCredentialCipher({activeKeyId:'v1',keys:{v1:key}}),a=cipher.seal(scope,{token:'fake'});
 for(const field of ['ciphertext','tag','iv']){const bytes=Buffer.from(a[field],'base64');bytes[0]^=1;assert.throws(()=>cipher.open(scope,{...a,[field]:bytes.toString('base64')}),/CREDENTIAL_UNAVAILABLE/);}
 for(const value of [{...a,extra:true},{...a,keyId:'missing'},{...a,version:2},{...a,ciphertext:'x'.repeat(100000)}])assert.throws(()=>cipher.open(scope,value),/CREDENTIAL_UNAVAILABLE/);
});
test('key rotation reads older envelopes but new writes use the active key',()=>{
 assert.equal(typeof createCredentialCipher,'function');const old=createCredentialCipher({activeKeyId:'v1',keys:{v1:key}}),a=old.seal(scope,{token:'fake'});
 const rotated=createCredentialCipher({activeKeyId:'v2',keys:{v1:key,v2:Buffer.alloc(32,9).toString('base64')}});
 assert.deepEqual(rotated.open(scope,a),{token:'fake'});assert.equal(rotated.seal(scope,{token:'new'}).keyId,'v2');
});
test('invalid configuration, scope and oversized or nested credentials are rejected',()=>{
 assert.equal(typeof createCredentialCipher,'function');for(const keys of [{},{v1:'bad'},{v1:Buffer.alloc(16).toString('base64')}])assert.throws(()=>createCredentialCipher({activeKeyId:'v1',keys}));
 const cipher=createCredentialCipher({activeKeyId:'v1',keys:{v1:key}});
 for(const value of [{},{token:{nested:'x'}},{token:'x'.repeat(2049)},{token:'line\nbreak'}])assert.throws(()=>cipher.seal(scope,value));
 for(const changed of [{...scope,revision:0},{...scope,provider:'OTHER'},{...scope,tenantId:'bad'},{...scope,extra:true}])assert.throws(()=>cipher.seal(changed,{token:'fake'}));
});
