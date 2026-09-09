'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const asar=require('@electron/asar');
const {verifyPackage,sourceFiles}=require('../scripts/verify-package.cjs');
async function fixture(){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'moaon-package-gate-')),source=path.join(root,'source'),archive=path.join(root,'app.asar');fs.mkdirSync(path.join(source,'ui','nested'),{recursive:true});
 fs.writeFileSync(path.join(source,'package.json'),JSON.stringify({name:'fixture',version:'1.0.0',main:'main.cjs',dependencies:{example:'1.0.0'},build:{files:['main.cjs','ui/**/*']}}));
 fs.writeFileSync(path.join(source,'main.cjs'),'module.exports=1;');fs.writeFileSync(path.join(source,'ui','nested','view.html'),'<p>fixture</p>');const output=await asar.createPackage(source,archive);await require('node:stream/promises').finished(output);return {sourceRoot:source,archive};
}
test('full payload verification detects nested UI drift and manifest version mismatch',async()=>{
 const f=await fixture();assert.equal(verifyPackage(f).status,'PASS');assert.equal(verifyPackage(f).checkedFiles,2);
 fs.writeFileSync(path.join(f.sourceRoot,'ui','nested','view.html'),'<p>changed</p>');assert.deepEqual(verifyPackage(f).failures,['CONTENT_MISMATCH:ui/nested/view.html']);
 const p=path.join(f.sourceRoot,'package.json'),m=JSON.parse(fs.readFileSync(p));m.version='2.0.0';fs.writeFileSync(p,JSON.stringify(m));assert.ok(verifyPackage(f).failures.includes('MANIFEST_VERSION'));
});
test('new required file and changed production dependencies fail release verification',async()=>{
 const f=await fixture();fs.writeFileSync(path.join(f.sourceRoot,'ui','new.js'),'new');const p=path.join(f.sourceRoot,'package.json'),m=JSON.parse(fs.readFileSync(p));m.dependencies.example='2.0.0';fs.writeFileSync(p,JSON.stringify(m));
 assert.deepEqual(verifyPackage(f).failures,['DEPENDENCIES_MISMATCH','MISSING_FILE:ui/new.js']);
});
test('source enumeration rejects traversal and unsupported patterns',()=>{
 for(const pattern of ['../private','ui/*.js',path.resolve('private')])assert.throws(()=>sourceFiles(process.cwd(),[pattern]));
});
test('CLI exits unsuccessfully for an unreadable archive without exposing file contents',()=>{
 const result=require('node:child_process').spawnSync(process.execPath,[path.resolve(__dirname,'../scripts/verify-package.cjs'),path.join(os.tmpdir(),'missing-moaon-archive.asar')],{encoding:'utf8'});
 assert.equal(result.status,1);assert.equal(JSON.parse(result.stderr).status,'FAIL');assert.match(result.stderr,/PACKAGE_VERIFICATION_UNAVAILABLE/);
});
