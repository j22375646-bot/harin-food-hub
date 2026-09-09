'use strict';
const {checkCredentialContract}=require('../lib/tenancy/credential-contract-check.js');
// No env files, arbitrary SQL, targets or operational attestation arguments.
async function main(){
 let result;
 if(process.argv.length!==2){const disabled=await checkCredentialContract({env:{}});result={...disabled,checks:[{code:'CLI_ARGUMENTS',status:'INVALID'}]};}
 else result=await checkCredentialContract();
 process.stdout.write(JSON.stringify(result)+'\n');
 process.exitCode=result.status==='CREDENTIAL_CONTRACT_MATCHES_REQUIRES_OPERATIONS'?0:1;
}
main();
