'use strict';
const {renderLabel,renderLabels}=require('./local-label.cjs');
const {randomUUID}=require('node:crypto');
async function withDeadline(promise,ms){let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Print timeout')),ms);})]);}finally{clearTimeout(timer);}}
const INSPECT=`(()=>{const labels=document.querySelectorAll('article.label');const label=labels[0];const receiver=label?.querySelector('.receiver');return {count:labels.length,id:label?.querySelector('footer span')?.textContent.trim(),invoice:label?.querySelector('.barcode>b')?.textContent.trim(),receiverValid:!!receiver && !!receiver.querySelector('h1')?.textContent.trim() && /^[0-9 -]{9,20}$/.test(receiver.querySelector('strong')?.textContent||'') && /\\([0-9]{5}\\)/.test(receiver.querySelector('p')?.textContent||'') && !receiver.textContent.includes('확인 필요')};})()`;

// Local memory-only document; no web label URL, cookies, assets or disk copy.
function createLabelPreview({BrowserWindow,Menu,dialog,getParent}){
  let current=null;
  function close(){const old=current;current=null;if(old&&!old.isDestroyed())old.destroy();}
  function context(){return {labelWebContentsId:current&&!current.isDestroyed()?current.webContents.id:null,labelUrl:current?.labelUrl||null};}
  async function open({hubOrderId,trackingNo,validate,expectedReceiver,goodsName,quantity,businessName='',channelLabel='',labels}={}){
    if(typeof validate!=='function')throw Error('Print validation required');
    const batch=labels!==undefined;
    const targets=batch?labels:[{hubOrderId,trackingNo,expectedReceiver,goodsName,quantity,businessName,channelLabel}];
    if(!Array.isArray(targets)||targets.length<1||targets.length>20)return {status:'PRINT_UNAVAILABLE'};
    if(batch){({hubOrderId,trackingNo,expectedReceiver,goodsName,quantity,businessName='',channelLabel=''}=targets[0]||{});}
    if(typeof hubOrderId!=='string'||!/^HR-(?:C24|CP)-[A-F0-9]{8}$/.test(hubOrderId)||typeof trackingNo!=='string'||!/^\d{13}$/.test(trackingNo))throw Error('Invalid label target');
    close();const parent=getParent();if(!parent||parent.isDestroyed())return {status:'PRINT_UNAVAILABLE'};
    const clean=value=>typeof value==='string'?value.trim().replace(/\s+/g,' '):'';
    const receiver=expectedReceiver;
    if(!clean(receiver?.name)||!clean(receiver?.address)||!/^\d{5}$/.test(receiver?.postCode||'')||!/^\d{9,12}$/.test((receiver?.contact||'').replace(/[\s-]/g,'')))return {status:'PRINT_UNAVAILABLE'};
    const expected={name:clean(receiver.name),contact:receiver.contact.replace(/[\s-]/g,''),address:clean(`(${receiver.postCode}) ${receiver.address} ${receiver.addressDetail||''}`)};
    let html;try{html=batch?renderLabels(targets.map(row=>({...row,receiver:row.expectedReceiver}))):renderLabel({hubOrderId,trackingNo,receiver,goodsName,quantity,businessName,channelLabel});}catch{return {status:'PRINT_UNAVAILABLE'};}
    const url='about:blank';
    const win=new BrowserWindow({parent,width:620,height:820,show:false,title:'모아온 · 송장 미리보기',autoHideMenuBar:false,
      webPreferences:{partition:'moaon-print-'+randomUUID(),nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true,javascript:false,webviewTag:false,devTools:false,spellcheck:false}});
    win.webContents.session?.webRequest.onBeforeRequest({urls:['<all_urls>']},(_request,done)=>done({cancel:true}));
    win.webContents.session?.setPermissionRequestHandler((_contents,_permission,done)=>done(false));
    current=win;win.labelUrl=url;
    const alive=()=>current===win&&!win.isDestroyed();
    let printing=false,attempted=false,timer;
    async function verify(){
      if(!alive()||win.webContents.getURL()!==url)return false;
      // World 0 follows javascript:false; only this fixed host-owned isolated code runs.
      const inspect=code=>win.webContents.executeJavaScriptInIsolatedWorld(999,[{code}]);
      if(batch){
        const rows=await inspect(`(()=>Array.from(document.querySelectorAll('article.label'),label=>{const r=label.getBoundingClientRect(),receiver=label.querySelector('.receiver');return {id:label.querySelector('footer span')?.textContent.trim(),invoice:label.querySelector('.barcode>b')?.textContent.trim(),name:receiver?.querySelector('h1')?.textContent,contact:receiver?.querySelector('strong')?.textContent,address:receiver?.querySelector('p')?.textContent,fit:r.width<=100*96/25.4+1&&r.height<=150*96/25.4+1&&label.scrollWidth<=label.clientWidth+1};}))()`);
        return alive()&&Array.isArray(rows)&&rows.length===targets.length&&rows.every((row,index)=>{
          const target=targets[index],receiver=target.expectedReceiver;
          return row.fit===true&&row.id===target.hubOrderId&&row.invoice===target.trackingNo&&clean(row.name)===clean(receiver.name)&&clean(row.contact).replace(/[\s-]/g,'')===clean(receiver.contact).replace(/[\s-]/g,'')&&clean(row.address)===clean(`(${receiver.postCode}) ${receiver.address} ${receiver.addressDetail||''}`)&&![row.name,row.contact,row.address].some(value=>value?.includes('확인 필요'));
        });
      }
      const data=await inspect(INSPECT);
      const fit=await inspect(`(()=>{const label=document.querySelector('article.label'),r=label?.getBoundingClientRect();return {ok:!!r&&r.width<=100*96/25.4+1&&r.height<=150*96/25.4+1&&label.scrollWidth<=label.clientWidth+1};})()`);
      if(fit?.ok!==true)return false;
      const actual=await inspect(`(()=>{const r=document.querySelector('article.label .receiver');return {name:r?.querySelector('h1')?.textContent,contact:r?.querySelector('strong')?.textContent,address:r?.querySelector('p')?.textContent};})()`);
      return alive()&&data?.count===1&&data.id===hubOrderId&&data.invoice===trackingNo&&data.receiverValid===true&&clean(actual?.name)===expected.name&&clean(actual?.contact).replace(/[\s-]/g,'')===expected.contact&&clean(actual?.address)===expected.address;
    }
    const menu=Menu.buildFromTemplate([
      {id:'print',label:'인쇄 설정 열기',enabled:false,click:async()=>{
        if(printing||!alive())return;printing=true;
        menu.getMenuItemById('print').enabled=false;
        win.setTitle('인쇄 준비 · 주문과 송장을 확인 중');
        try{
          if(!await withDeadline(validate(),15000)||!await withDeadline(verify(),15000))throw Error();
          const answer=await withDeadline(dialog.showMessageBox(win,{type:'question',title:'기존 송장 인쇄',message:`송장 ${targets.length}건의 받는 분과 송장번호를 확인했나요?`,detail:(attempted?'이 창에서 이미 인쇄를 요청했습니다. 중복 출력되지 않도록 프린터 대기열과 실제 출력물을 먼저 확인하세요.\n\n':'')+'이미 발급된 송장만 인쇄합니다. 실제 용지에 맞춰 프린터 설정을 확인하세요. 기본 문서 크기는 100 × 150mm입니다.',buttons:['취소','인쇄 설정 열기'],defaultId:0,cancelId:0,noLink:true}),60000);
          if(answer?.response!==1){if(alive())win.setTitle('인쇄 취소 · 새 인쇄 요청 없음');return;}
          if(!await withDeadline(validate(),15000)||!await withDeadline(verify(),15000))throw Error();
          attempted=true;win.setTitle('인쇄 설정·처리 중 · 중복 요청 차단');
          await withDeadline(new Promise(resolve=>win.webContents.print({silent:false,printBackground:true,pageSize:{width:100000,height:150000},margins:{marginType:'none'}},(success,reason)=>{
            if(alive())win.setTitle(success?'인쇄 요청 전달됨 · 실제 출력 확인 필요':reason==='Print job canceled'?'인쇄 취소 · 출력 상태 확인':'인쇄 실패 · 프린터와 대기열 확인');resolve();
          })),60000);
        }catch{if(alive())win.setTitle('문서 확인 실패 · 창을 닫고 다시 확인하세요');}
        finally{printing=false;if(alive())menu.getMenuItemById('print').enabled=true;}
      }},
      {label:'닫기',click:()=>{if(alive())close();}},
    ]);
    win.setMenu(menu);
    win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
    for(const eventName of ['will-navigate','will-redirect','will-attach-webview'])win.webContents.on(eventName,event=>{event.preventDefault();if(alive())close();});
    win.webContents.on('did-navigate',(_event,target)=>{if(target!==url){if(alive())close();}});
    win.on('closed',()=>{if(current===win)current=null;});
    try{
      await Promise.race([(async()=>{await win.loadURL(url);await win.webContents.executeJavaScriptInIsolatedWorld(999,[{code:`document.open();document.write(${JSON.stringify(html)});document.close();`}]);html=null;if(!await validate()||!await verify())throw Error();})(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Label timeout')),15000);})]);
      if(!alive())return {status:'PRINT_UNAVAILABLE'};
      menu.getMenuItemById('print').enabled=true;win.show();return {status:'PREVIEW_OPEN'};
    }catch{if(alive())close();return {status:'PRINT_UNAVAILABLE'};}
    finally{clearTimeout(timer);}
  }
  return Object.freeze({open,close,context});
}
module.exports={createLabelPreview};
