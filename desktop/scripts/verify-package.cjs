'use strict';
// Read-only release gate: compare the entire declared application payload.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const asar=require('@electron/asar');
function sourceFiles(root,patterns){
 const files=[];
 function walk(relative){
  const full=path.join(root,relative),stat=fs.lstatSync(full);
  if(stat.isSymbolicLink())throw Error('Unsupported source link');
  if(stat.isDirectory()){for(const name of fs.readdirSync(full).sort())walk(path.join(relative,name));}
  else if(stat.isFile())files.push(relative.split(path.sep).join('/'));
 }
 for(const pattern of patterns){
  if(typeof pattern!=='string'||path.isAbsolute(pattern)||pattern.split(/[\\/]/).includes('..'))throw Error('Invalid source pattern');
  if(pattern==='ui/**/*')walk('ui');
  else if(/[?*]/.test(pattern))throw Error('Unsupported source pattern');
  else walk(pattern);
 }
 return [...new Set(files)].sort();
}
function verifyPackage({sourceRoot,archive}){
 const manifest=JSON.parse(fs.readFileSync(path.join(sourceRoot,'package.json'),'utf8'));
 const packaged=JSON.parse(asar.extractFile(archive,'package.json').toString('utf8'));
 const failures=[];
 for(const key of ['name','version','main'])if(manifest[key]!==packaged[key])failures.push('MANIFEST_'+key.toUpperCase());
 const dependencies=p=>Object.entries(p.dependencies||{}).sort(([a],[b])=>a.localeCompare(b));
 if(JSON.stringify(dependencies(manifest))!==JSON.stringify(dependencies(packaged)))failures.push('DEPENDENCIES_MISMATCH');
 const files=sourceFiles(sourceRoot,manifest.build.files);
 for(const file of files){
  try{if(!fs.readFileSync(path.join(sourceRoot,file)).equals(asar.extractFile(archive,path.normalize(file))))failures.push('CONTENT_MISMATCH:'+file);}
  catch{failures.push('MISSING_FILE:'+file);}
 }
 return {status:failures.length?'FAIL':'PASS',version:packaged.version,checkedFiles:files.length,sha256:crypto.createHash('sha256').update(fs.readFileSync(archive)).digest('hex'),failures};
}
if(require.main===module){
 try{
  if(process.argv.length!==3||!path.isAbsolute(process.argv[2]))throw Error('Absolute archive path required');
  const result=verifyPackage({sourceRoot:path.resolve(__dirname,'..'),archive:process.argv[2]});console.log(JSON.stringify(result));if(result.status!=='PASS')process.exitCode=1;
 }catch{console.error(JSON.stringify({status:'FAIL',failures:['PACKAGE_VERIFICATION_UNAVAILABLE']}));process.exitCode=1;}
}
module.exports={verifyPackage,sourceFiles};
