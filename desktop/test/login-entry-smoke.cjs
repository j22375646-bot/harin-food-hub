'use strict';
// The popup probe is superseded by the one-window native-form probe.
// Preserve these entry points for existing verification commands.
const path=require('node:path');
const index=process.argv.indexOf('--executable');
if(index>=0)process.env.MOAON_INLINE_RUNTIME=path.join(path.dirname(process.argv[index+1]),'resources','app.asar');
if(process.argv.includes('--packaged')&&!process.env.MOAON_INLINE_RUNTIME)throw Error('Set MOAON_INLINE_RUNTIME to the packaged app.asar');
require('./inline-login-smoke.cjs');
