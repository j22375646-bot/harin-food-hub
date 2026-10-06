'use strict';
const {checkCredentialInvariants}=require('../lib/tenancy/credential-invariants-check.js');
async function main(){
 let result;
 if(process.argv.length!==2){const disabled=await checkCredentialInvariants({env:{}});result={...disabled,checks:[{code:'CLI_ARGUMENTS',status:'INVALID'}]};}
 else result=await checkCredentialInvariants();
 process.stdout.write(JSON.stringify(result)+'\n');
 process.exitCode=result.status==='CREDENTIAL_INVARIANTS_MATCH_REQUIRES_OPERATIONS'?0:1;
}
main();
