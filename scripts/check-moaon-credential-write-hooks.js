'use strict';
const {checkCredentialWriteHooks}=require('../lib/tenancy/credential-write-hooks-check.js');
async function main(){
 const result=process.argv.length===2?await checkCredentialWriteHooks():{
  ...await checkCredentialWriteHooks({env:{}}),checks:[{code:'CLI_ARGUMENTS',status:'INVALID'}],
 };
 process.stdout.write(JSON.stringify(result)+'\n');
 process.exitCode=result.status==='CREDENTIAL_WRITE_HOOKS_MATCH_REQUIRES_OPERATIONS'?0:1;
}
main();
