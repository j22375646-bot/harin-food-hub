'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {normalizeWindowsWebpackEntries}=require('../lib/build/windows-webpack-entries.js');
test('cross-drive Next runtime entries become absolute without rewriting ordinary requests',()=>{
 const original={main:'./C:/deps/next.js',app:{import:['./C:\\deps\\app.js','./local.js','next/client'],dependOn:'shared'},other:'loader!./C:/file',relative:'../client.js'};
 const result=normalizeWindowsWebpackEntries(original);
 assert.equal(result.main,'C:/deps/next.js');assert.deepEqual(result.app,{import:['C:\\deps\\app.js','./local.js','next/client'],dependOn:'shared'});
 assert.equal(result.other,original.other);assert.equal(result.relative,original.relative);assert.equal(original.main,'./C:/deps/next.js');
});
test('real Next config preserves deferred entry context and only normalizes Windows paths',async()=>{
 const config=require('../next.config.js');let calls=0;
 const input={marker:7,entry:async function(){calls++;assert.equal(this.marker,7);return {main:'./C:/deps/next.js',local:'./client.js'};}};
 const output=config.webpack(input);assert.equal(output,input);assert.equal(calls,0);
 const result=await output.entry();assert.equal(calls,1);assert.equal(result.main,process.platform==='win32'?'C:/deps/next.js':'./C:/deps/next.js');assert.equal(result.local,'./client.js');
});
