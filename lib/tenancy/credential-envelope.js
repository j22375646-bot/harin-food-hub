'use strict';

// Server-only encryption primitive. Callers must independently authorize every read/write.
const {createCipheriv,createDecipheriv,randomBytes}=require('node:crypto');
const unavailable=()=>new Error('CREDENTIAL_UNAVAILABLE');
const plain=v=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.getPrototypeOf(v)===Object.prototype;
const exact=(v,keys)=>plain(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
const keyName=v=>typeof v==='string'&&/^[a-zA-Z0-9_-]{1,64}$/.test(v);
function bytes(value,length,max=32768){
 if(typeof value!=='string'||value.length>max*2)throw unavailable();
 const decoded=Buffer.from(value,'base64');
 if(decoded.toString('base64')!==value||!decoded.length||decoded.length>max||(length&&decoded.length!==length))throw unavailable();
 return decoded;
}
function binding(scope,keyId){
 if(!exact(scope,['tenantId','provider','revision'])||typeof scope.tenantId!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(scope.tenantId)||!['NAVER','CAFE24','COUPANG','EPOST'].includes(scope.provider)||!Number.isSafeInteger(scope.revision)||scope.revision<1)throw unavailable();
 return Buffer.from(JSON.stringify(['moaon-credentials',1,keyId,scope.tenantId.toLowerCase(),scope.provider,scope.revision]));
}
function payload(value){
 if(!plain(value)||Object.keys(value).length<1||Object.keys(value).length>16)throw unavailable();
 for(const [name,text] of Object.entries(value))if(!keyName(name)||typeof text!=='string'||text.length>2048||/[\u0000-\u001f\u007f-\u009f]/u.test(text))throw unavailable();
 const encoded=Buffer.from(JSON.stringify(value));if(encoded.length>16384)throw unavailable();return encoded;
}
function createCredentialCipher({activeKeyId,keys}={}){
 if(!keyName(activeKeyId)||!plain(keys)||!Object.hasOwn(keys,activeKeyId)||Object.keys(keys).length>8)throw unavailable();
 const ring=new Map();for(const [id,value] of Object.entries(keys)){if(!keyName(id))throw unavailable();ring.set(id,bytes(value,32));}
 return Object.freeze({
  seal(scope,value){
   let data;
   try{
    const aad=binding(scope,activeKeyId);data=payload(value);const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',ring.get(activeKeyId),iv);cipher.setAAD(aad);
    const ciphertext=Buffer.concat([cipher.update(data),cipher.final()]);
    return Object.freeze({version:1,keyId:activeKeyId,iv:iv.toString('base64'),ciphertext:ciphertext.toString('base64'),tag:cipher.getAuthTag().toString('base64')});
   }catch{throw unavailable();}finally{data?.fill(0);}
  },
  open(scope,envelope){
   let decrypted,validated;
   try{
    if(!exact(envelope,['version','keyId','iv','ciphertext','tag'])||envelope.version!==1||!ring.has(envelope.keyId))throw unavailable();
    const decipher=createDecipheriv('aes-256-gcm',ring.get(envelope.keyId),bytes(envelope.iv,12));decipher.setAAD(binding(scope,envelope.keyId));decipher.setAuthTag(bytes(envelope.tag,16));
    decrypted=Buffer.concat([decipher.update(bytes(envelope.ciphertext,0,16384)),decipher.final()]);
    const value=JSON.parse(decrypted.toString('utf8'));validated=payload(value);return value;
   }catch{throw unavailable();}finally{decrypted?.fill(0);validated?.fill(0);}
  }
 });
}
module.exports={createCredentialCipher};
