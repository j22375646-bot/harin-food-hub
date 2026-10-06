'use strict';
const fs=require('node:fs'),path=require('node:path');
const {sourceFiles}=require('./verify-package.cjs');
function releaseConfig(source,channel){
 const pkg=structuredClone(source);pkg.build.artifactName='Moaon-${version}-Setup.${ext}';pkg.build.nsis.shortcutName='모아온';pkg.build.nsis.uninstallDisplayName='모아온';pkg.build.nsis.deleteAppDataOnUninstall=false;
 if(channel?.mode==='ed25519'){
  const url=new URL(channel.url);if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||require('node:crypto').createPublicKey(channel.publicKey).asymmetricKeyType!=='ed25519')throw Error('HTTPS feed and Ed25519 key required');
  pkg.build.publish={provider:'generic',url:channel.url};pkg.build.forceCodeSigning=false;pkg.build.win.signAndEditExecutable=true;pkg.build.win.signExecutable=false;pkg.build.win.verifyUpdateCodeSignature=false;
 }else if(channel){
  const url=new URL(channel.url);if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||!url.hostname.includes('.')||!channel.publisherName||typeof channel.publisherName!=='string')throw Error('HTTPS feed and verified publisher required');
  pkg.build.publish={provider:'generic',url:channel.url};pkg.build.forceCodeSigning=true;pkg.build.win.signAndEditExecutable=true;pkg.build.win.verifyUpdateCodeSignature=true;
  if(channel.azureSignOptions){const a=channel.azureSignOptions;if(!['endpoint','codeSigningAccountName','certificateProfileName'].every(k=>typeof a[k]==='string'&&a[k]))throw Error('Azure signing profile required');pkg.build.win.azureSignOptions={...a,publisherName:channel.publisherName};}
  else pkg.build.win.signtoolOptions={certificateSubjectName:channel.publisherName,publisherName:[channel.publisherName]};
 }else{pkg.build.publish=null;pkg.build.win.signAndEditExecutable=false;}
 return pkg;
}
function prepare({sourceRoot,stage,channel=null,dependencyRoot}){
 if(!path.isAbsolute(stage)||!/^D:[\\/]/i.test(stage)||fs.existsSync(stage))throw Error('New absolute D-drive stage required');
 const source=JSON.parse(fs.readFileSync(path.join(sourceRoot,'package.json'),'utf8')),pkg=releaseConfig(source,channel);fs.mkdirSync(stage,{recursive:true});
 for(const file of sourceFiles(sourceRoot,source.build.files)){const target=path.join(stage,file);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(path.join(sourceRoot,file),target);}
 fs.writeFileSync(path.join(stage,'package.json'),JSON.stringify(pkg,null,2));if(channel)fs.writeFileSync(path.join(stage,'update-channel.json'),JSON.stringify(channel.mode==='ed25519'?{enabled:true,mode:channel.mode,url:channel.url,publicKey:channel.publicKey}:{enabled:true,url:channel.url,publisherName:channel.publisherName},null,2));
 fs.symlinkSync(dependencyRoot,path.join(stage,'node_modules'),'junction');return {version:pkg.version,autoUpdate:!!channel,stage};
}
if(require.main===module){try{const [stage,config]=process.argv.slice(2);console.log(JSON.stringify(prepare({sourceRoot:path.resolve(__dirname,'..'),stage,channel:config?JSON.parse(fs.readFileSync(config,'utf8')):null,dependencyRoot:'D:/GPT/deps/moaon-updater-runtime/node_modules'})));}catch(e){console.error(e.message);process.exitCode=1;}}
module.exports={releaseConfig,prepare};
