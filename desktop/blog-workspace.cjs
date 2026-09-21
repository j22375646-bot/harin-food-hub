'use strict';
const fs=require('node:fs/promises');
function blogAddress(value){
 if(typeof value!=='string'||value.length>200)throw Error('네이버 블로그 주소를 확인해 주세요.');
 const raw=value.trim();let id=raw;
 if(raw.includes('://')){let u;try{u=new URL(raw);}catch{throw Error('블로그 주소 형식이 올바르지 않습니다.');}
  if(u.protocol!=='https:'||!['blog.naver.com','m.blog.naver.com'].includes(u.hostname)||u.port||u.username||u.password||u.search||u.hash)throw Error('https://blog.naver.com/아이디 형태로 입력해 주세요.');
  id=u.pathname.replace(/^\//,'').replace(/\/$/,'');
 }
 if(!/^[a-zA-Z0-9_-]{3,50}$/.test(id))throw Error('블로그 홈 주소 또는 블로그 아이디를 입력해 주세요.');
 return {id,url:`https://blog.naver.com/${id}`};
}
function draft(value){
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).sort().join(',')!=='body,title'||typeof value.title!=='string'||typeof value.body!=='string'||value.title.length>150||value.body.length>30000||!value.title.trim()||!value.body.trim())throw Error('제목과 본문을 입력해 주세요. 제목 150자, 본문 30,000자까지 저장할 수 있어요.');
 return {title:value.title,body:value.body};
}
async function probe(value,fetcher=fetch){
 const {id,url}=blogAddress(value);
 try{
  // Manual redirects: never fetch an arbitrary redirect target or forward cookies.
  const r=await fetcher(`https://blog.naver.com/PostList.naver?blogId=${encodeURIComponent(id)}`,{redirect:'manual',signal:AbortSignal.timeout(12000),headers:{Accept:'text/html'}});
  const reader=r.body?.getReader();let bytes=0;const chunks=[];
  try{if(reader)while(bytes<524288){const {done,value:chunk}=await reader.read();if(done)break;bytes+=chunk.length;chunks.push(Buffer.from(chunk));}}finally{await reader?.cancel();}
  const html=Buffer.concat(chunks).toString('utf8');
  const reached=r.status===200&&/text\/html/i.test(r.headers.get('content-type')||'')&&!/captcha|자동입력|존재하지 않는|사용제한|접근이 제한/i.test(html)&&/blogId|blogid|블로그/.test(html);
  return {ok:reached,url,checkedAt:new Date().toISOString(),message:reached?'공개 페이지 응답 확인 · 소유 계정·로그인·글쓰기 권한은 네이버에서 확인해 주세요.':'페이지 확인 필요 · 주소를 확인하거나 블로그 열기로 직접 확인해 주세요.'};
 }catch{return {ok:false,url,checkedAt:new Date().toISOString(),message:'접속 확인에 실패했어요. 네트워크를 확인하고 다시 시도해 주세요.'};}
}
function registerBlogWorkspace({ipc,isTrusted,shell,dialog,clipboard,getWindow,imageService,nativeImage}){
 ipc.handle('moaon-hub:blog-workspace',async(event,...args)=>{
  if(!isTrusted(event)||args.length!==1)throw Error('Untrusted blog request');
  const v=args[0];if(!v||typeof v!=='object'||Object.keys(v).sort().join(',')!=='action,value')throw Error('Invalid blog request');
  if(v.action.startsWith('image-')){
   try{
    if(!imageService)return {ok:false,status:'SETUP_REQUIRED'};
    if(v.action==='image-status'&&v.value===null)return await imageService.status();
    if(v.action==='image-cancel'&&v.value===null)return imageService.cancel();
    if(v.action==='image-settings')return await imageService.configure(v.value);
    if(v.action==='image-generate'){
     const r=await imageService.generate(v.value),image=nativeImage.createFromDataURL(r.dataUrl),size=image.getSize();
     if(image.isEmpty()||size.width>2048||size.height>2048)throw Error('INVALID_OUTPUT');
     return {...r,dataUrl:image.toDataURL()};
    }
    if(v.action==='image-save'){
     if(typeof v.value!=='string'||v.value.length>14000000||!v.value.startsWith('data:image/png;base64,'))throw Error('INVALID_REQUEST');
     const image=nativeImage.createFromDataURL(v.value),size=image.getSize();if(image.isEmpty()||size.width>2048||size.height>2048)throw Error('INVALID_REQUEST');
     const out=await dialog.showSaveDialog(getWindow(),{title:'블로그 대표 이미지 저장',defaultPath:'모아온-블로그-대표이미지.png',filters:[{name:'PNG 이미지',extensions:['png']}]});
     if(out.canceled||!out.filePath)return {ok:false,canceled:true};await fs.writeFile(out.filePath,image.toPNG());return {ok:true};
    }
    throw Error('INVALID_REQUEST');
   }catch(e){return {ok:false,status:['CANCELLED','PENDING','SETUP_REQUIRED','KEY_REQUIRED','QUOTA_BLOCKED','DUPLICATE','TIMEOUT','INVALID_OUTPUT','PROVIDER_LIMIT','PROVIDER_ERROR','INVALID_REQUEST','STORAGE_ERROR'].includes(e.message)?e.message:'STORAGE_ERROR'};}
  }
  if(v.action==='probe')return probe(v.value);
  if(v.action==='open'){const {url}=blogAddress(v.value);await shell.openExternal(url);return {ok:true};}
  if(v.action==='copy'){const d=draft(v.value);clipboard.writeText(`${d.title}\n\n${d.body}`);return {ok:true};}
  if(v.action==='save'){
   const d=draft(v.value);const out=await dialog.showSaveDialog(getWindow(),{title:'블로그 초안 저장',defaultPath:'모아온-블로그-초안.json',filters:[{name:'모아온 블로그 초안',extensions:['json']}]});
   if(out.canceled||!out.filePath)return {ok:false,canceled:true};
   await fs.writeFile(out.filePath,JSON.stringify({format:'moaon-blog-v1',...d},null,2),'utf8');return {ok:true};
  }
  if(v.action==='load'&&v.value===null){
   const out=await dialog.showOpenDialog(getWindow(),{title:'블로그 초안 불러오기',properties:['openFile'],filters:[{name:'모아온 블로그 초안',extensions:['json']}]});
   if(out.canceled||!out.filePaths[0])return {ok:false,canceled:true};
   if((await fs.stat(out.filePaths[0])).size>200000)throw Error('초안 파일이 너무 큽니다.');
   const data=JSON.parse(await fs.readFile(out.filePaths[0],'utf8'));if(data.format!=='moaon-blog-v1')throw Error('모아온에서 저장한 초안 파일을 선택해 주세요.');
   return {ok:true,draft:draft({title:data.title,body:data.body})};
  }
  throw Error('Invalid blog action');
 });
}
module.exports={blogAddress,draft,probe,registerBlogWorkspace};
