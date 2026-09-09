'use strict';

// Intentionally no dotenv/env-file loading, network calls or CLI overrides.
const {readCredentialReadiness}=require('../lib/tenancy/credential-readiness.js');
const result=readCredentialReadiness(process.env);
const output=process.argv.length===2?result:{...result,status:'BLOCKED',checks:[...result.checks,{code:'CLI_ARGUMENTS',status:'INVALID'}]};
process.stdout.write(JSON.stringify(output)+'\n');
process.exitCode=output.status==='CONFIGURATION_VALID_REQUIRES_OPERATIONS'?0:1;
