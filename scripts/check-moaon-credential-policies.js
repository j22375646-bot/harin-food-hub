'use strict';
const {checkCredentialPolicies}=require('../lib/tenancy/credential-policy-check.js');
async function main(){
 const result=process.argv.length===2?await checkCredentialPolicies():{
  ...await checkCredentialPolicies({env:{}}),checks:[{code:'CLI_ARGUMENTS',status:'INVALID'}],
 };
 process.stdout.write(JSON.stringify(result)+'\n');
 process.exitCode=result.status==='CREDENTIAL_POLICIES_MATCH_REQUIRES_OPERATIONS'?0:1;
}
main();
