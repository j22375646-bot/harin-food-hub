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
   const clean=value=>typeof value==='string'?value.replace(/[\x00-\x1f\x7f\u202a-\u202e\u2066-\u2069]/g,' ').trim().slice(0,120):'';
   // Names are hints only. An unknown queue must never be called a physical printer.
   const virtualName=/^(?:Microsoft Print to PDF|Microsoft XPS Document Writer|Hancom PDF|Fax|OneNote(?: \(Desktop\)| for Windows 10)?)$/i;
   const rows=printers.slice(0,50).map(value=>{
    const p=value&&typeof value==='object'?value:{};
    const name=clean(p.displayName)||clean(p.name)||'이름 확인 필요';
    const virtual=virtualName.test(clean(p.name))||virtualName.test(name);
    return {virtual,line:`${name}${p.isDefault===true?' (기본)':''} · ${virtual?'가상 출력 추정':`코드 ${Number.isInteger(p.status)?p.status:'확인 필요'} · 실물 확인 필요`}`};
   });
   const virtualCount=rows.filter(p=>p.virtual).length;
   const candidates=rows.length-virtualCount;
   const summary=`이 컴퓨터에 등록된 출력 장치 ${printers.length}개\n${printers.length>50?'표시된 50개 기준 · ':''}장비 확인 대상: ${candidates}개 · 가상 출력으로 추정: ${virtualCount}개`;
   const lines=rows.map(p=>p.line);
   await dialog.showMessageBox(win,{
    type:'info',title:'출고 PC 프린터 점검',
    message:candidates===0?'실제 송장 프린터를 확인하세요':'출력 장비와 송장 용지를 확인하세요',
    detail:summary+'\n\n'+(lines.join('\n')||'등록된 프린터가 없습니다. 프린터 연결과 드라이버 설치를 확인하세요.')
     +(printers.length>50?'\n목록은 처음 50개까지 표시합니다.':'')
     +'\n\n이름으로 구분한 참고 목록입니다. 목록과 상태 코드는 실제 연결·출력 성공을 보장하지 않습니다.'
     +'\n\n출고용 컴퓨터에서 확인할 항목\n• 실제 송장 프린터와 기본 장치 선택\n• 100 × 150mm 기본 송장 / A4 작업표 용지와 여백\n• 인쇄물 잘림 여부와 바코드 판독'
     +'\n\n프린터 설정 변경이나 시험 출력은 실행하지 않았습니다.',
    buttons:['닫기'],defaultId:0,cancelId:0,noLink:true,
   });
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
