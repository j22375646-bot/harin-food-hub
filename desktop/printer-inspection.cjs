'use strict';
function createPrinterInspection({getMainWindow,dialog}){
 let busy=false;
 return async function inspect(){
  if(busy)return {status:'BUSY'};
  const win=getMainWindow();if(!win||win.isDestroyed())return {status:'UNAVAILABLE'};
  busy=true;let timer;
  try{
   const printers=await Promise.race([win.webContents.getPrintersAsync(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('timeout')),5000);})]);
   if(win.isDestroyed()||win!==getMainWindow()||!Array.isArray(printers))return {status:'UNAVAILABLE'};
   const clean=value=>typeof value==='string'?value.replace(/[\x00-\x1f\x7f]/g,' ').slice(0,120):'';
   const lines=printers.slice(0,50).map(p=>`${clean(p.displayName)||clean(p.name)||'이름 확인 필요'}${p.isDefault===true?' (기본)':''} · 드라이버 상태 코드 ${Number.isInteger(p.status)?p.status:'확인 필요'}`);
   await dialog.showMessageBox(win,{type:'info',title:'출고 PC 프린터 점검',message:`Windows 등록 프린터 ${printers.length}개`,detail:(lines.join('\n')||'등록된 프린터가 없습니다. 출고 PC에서 프린터 연결과 드라이버 설치를 확인하세요.')+(printers.length>50?'\n목록은 처음 50개까지 표시합니다.':'')+'\n\nPDF 등 가상 프린터가 포함될 수 있습니다. 목록과 상태 코드는 실제 연결·출력 성공을 보장하지 않습니다.\n송장 기본 크기는 100 × 150mm입니다. 실제 용지와 여백을 확인하세요.\n프린터 설정 변경이나 시험 출력은 실행하지 않았습니다.',buttons:['닫기'],defaultId:0,cancelId:0,noLink:true});
   return {status:'SHOWN'};
  }catch{return {status:'UNAVAILABLE'};}
  finally{clearTimeout(timer);busy=false;}
 };
}
function registerPrinterInspection({ipcMain,getMainWindow,isTrustedRenderer,inspect}){
 ipcMain.handle('moaon-hub:inspect-printers',async(event,...args)=>{
  if(!isTrustedRenderer(event,getMainWindow())||args.length)throw Error('Untrusted printer inspection');
  return inspect();
 });
}
module.exports={createPrinterInspection,registerPrinterInspection};
