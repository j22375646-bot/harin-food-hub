'use strict';
// Publishes only the explicitly signed installer and two release metadata files.
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const {verifyManifest,verifyFile}=require('../signed-updates.cjs');
const repository='j22375646-bot/harin-food-hub',tag='moaon-stable';
async function publish(directory){
 const config=require('../update-channel.json');const p=verifyManifest(JSON.parse(fs.readFileSync(path.join(directory,'release.json'),'utf8')),config.publicKey);verifyFile(path.join(directory,p.file),p);
 const sourceVersion=require('../package.json').version;if(sourceVersion!==p.version)throw Error('Release version does not match source');
 const git=spawnSync('git',['credential','fill'],{input:'protocol=https\nhost=github.com\n\n',encoding:'utf8',windowsHide:true,env:{...process.env,GIT_TERMINAL_PROMPT:'0',GCM_INTERACTIVE:'never'}});if(git.status!==0)throw Error('GitHub authentication unavailable');const token=git.stdout.split(/\r?\n/).find(line=>line.startsWith('password='))?.slice(9);if(!token)throw Error('GitHub token unavailable');
 async function api(url,method='GET',body,raw=false){const r=await fetch(url.startsWith('https:')?url:`https://api.github.com/repos/${repository}${url}`,{method,headers:{Authorization:`Bearer ${token}`,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28',...(body?{'Content-Type':raw?'application/octet-stream':'application/json'}:{})},...(body?{body:raw?body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(180000)});if(r.status===404&&method==='GET')return null;if(!r.ok)throw Error(`GitHub release HTTP ${r.status}`);return r.status===204?{}:r.json();}
 let release=await api(`/releases/tags/${tag}`);if(!release){const list=await api('/releases?per_page=100');release=list?.find(r=>r.tag_name===tag);}
 if(!release){const head=spawnSync('git',['rev-parse','HEAD'],{encoding:'utf8',windowsHide:true}).stdout.trim();release=await api('/releases','POST',{tag_name:tag,target_commitish:head,name:'모아온 설치파일',body:'모아온 Windows 설치파일과 공개키 검증 업데이트 배포. Windows 유료 코드서명은 사용하지 않습니다.',draft:true,prerelease:false,make_latest:'false'});}
 const existing=await api(`/releases/${release.id}/assets?per_page=100`);if(existing.some(a=>a.name===p.file))throw Error('Version already published; choose a new version');
 const upload=release.upload_url.replace(/\{.*$/,'');await api(upload+'?name='+encodeURIComponent(p.file),'POST',fs.readFileSync(path.join(directory,p.file)),true);
 for(const name of ['release.json','latest.yml']){const old=existing.find(a=>a.name===name);if(old)await api(`/releases/assets/${old.id}`,'DELETE');await api(upload+'?name='+name,'POST',fs.readFileSync(path.join(directory,name)),true);}
 await api(`/releases/${release.id}`,'PATCH',{draft:false,name:`모아온 ${p.version}`,make_latest:'false'});
 return {version:p.version,url:`https://github.com/${repository}/releases/tag/${tag}`,installer:`${config.url}/${p.file}`,published:true};
}
if(require.main===module)publish(path.resolve(process.argv[2]||'')).then(v=>console.log(JSON.stringify(v))).catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={publish};
