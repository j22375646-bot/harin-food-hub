'use strict';
// Read-only installed-payload regression gate. UI tests use isolated fixtures on
// the secondary display; no production credentials or invoice writes are used.
const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process'),{verifyPackage}=require('./verify-package.cjs');
const suites=[['login','inline-login-smoke.cjs'],['slow-read','slow-order-read-ui.cjs'],['collection','collection-auto-sync-ui.cjs'],['collection-recovery','collection-recovery-ui.cjs'],['diagnostics','collection-diagnostics-ui.cjs'],['render','order-render-retention-ui.cjs'],['resources','shipping-resource-lifecycle-ui.cjs'],['shipping-popup','shipping-progress-toggle-ui.cjs','--isolated'],['restart-drain','update-restart-drain-ui.cjs'],['read-budget','read-budget-ui.cjs']];
async function main(){
 const args=process.argv.slice(2),option=name=>{const i=args.indexOf(name);return i<0?null:args[i+1];};
 const archive=option('--archive'),directory=option('--output');
 if(!archive||!directory||!path.isAbsolute(archive)||!path.isAbsolute(directory)||path.basename(archive)!=='app.asar'||!path.resolve(directory).toLowerCase().startsWith('d:\\gpt\\'))throw Error('Absolute app.asar and D:\\GPT output directory are required');
 const output=path.resolve(directory),sourceRoot=path.resolve(__dirname,'..');fs.mkdirSync(output,{recursive:true});fs.mkdirSync(path.join(output,'temp'),{recursive:true});
 const payload=verifyPackage({sourceRoot,archive});if(payload.status!=='PASS')throw Error('Installed payload does not match current application sources');
 const receiptFile=path.join(output,'receipt.json');let receipt={status:'RUNNING',startedAt:new Date().toISOString(),archive,payload,scope:'isolated installed-code UI; right secondary monitor; no production login or order writes',suites:[]};
 if(args.includes('--resume')&&fs.existsSync(receiptFile)){const previous=JSON.parse(fs.readFileSync(receiptFile,'utf8'));if(previous.payload?.sha256!==payload.sha256)throw Error('Cannot resume across changed payloads');receipt=previous;receipt.status='RUNNING';}
 const save=()=>fs.writeFileSync(receiptFile,JSON.stringify(receipt,null,2));save();
 for(const [name,file,...flags] of suites){
  if(receipt.suites.some(row=>row.name===name&&row.status==='PASS'))continue;
  const log=path.join(output,name+'.log'),fd=fs.openSync(log,'w'),started=Date.now();console.log('START '+name);
  const child=spawn(process.execPath,[path.join(sourceRoot,'test',file),...flags],{cwd:path.resolve(sourceRoot,'..'),windowsHide:true,stdio:['ignore',fd,fd],env:{...process.env,TEMP:path.join(output,'temp'),TMP:path.join(output,'temp'),MOAON_TEST_RUNTIME_ROOT:archive,MOAON_INLINE_RUNTIME:archive,MOAON_VERIFY_DISPLAY:'right',MOAON_VERIFY_HIDDEN:'0',MOAON_BUDGET_OUTPUT:path.join(output,'budget')}});
  let timedOut=false;const timer=setTimeout(()=>{timedOut=true;spawn('taskkill',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});},300000);
  const code=await new Promise(resolve=>{child.once('error',()=>resolve(-1));child.once('close',resolve);});clearTimeout(timer);fs.closeSync(fd);
  const row={name,status:code===0&&!timedOut?'PASS':'FAIL',exitCode:code,timedOut,durationMs:Date.now()-started,log};receipt.suites=receipt.suites.filter(old=>old.name!==name);receipt.suites.push(row);save();console.log(row.status+' '+name);
  if(row.status!=='PASS'){receipt.status='FAIL';save();process.exitCode=1;return;}
 }
 receipt.status='PASS';receipt.finishedAt=new Date().toISOString();save();console.log(JSON.stringify({status:receipt.status,version:payload.version,suites:receipt.suites.length,receipt:receiptFile}));
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
