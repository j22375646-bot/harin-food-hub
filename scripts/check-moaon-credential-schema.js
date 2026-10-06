'use strict';
// No env-file loading and no target, query or attestation overrides.
const {checkCredentialSchema}=require('../lib/tenancy/credential-schema-check.js');
async function main(){
 let result;
 if(process.argv.length!==2){
  const disabled=await checkCredentialSchema({env:{}});
  result={...disabled,checks:[{code:'CLI_ARGUMENTS',status:'INVALID'}]};
 }else result=await checkCredentialSchema();
 process.stdout.write(JSON.stringify(result)+'\n');
 process.exitCode=result.status==='SCHEMA_PRESENT_REQUIRES_OPERATIONS'?0:1;
}
main();
