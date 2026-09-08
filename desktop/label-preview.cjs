'use strict';
const {HARIN_ORIGIN,READONLY_PARTITION}=require('./connection-policy.cjs');
const INSPECT=`(()=>{const labels=document.querySelectorAll('article.label');const label=labels[0];const receiver=label?.querySelector('.receiver');return {count:labels.length,id:label?.querySelector('footer span')?.textContent.trim(),invoice:label?.querySelector('.barcode>b')?.textContent.trim(),receiverValid:!!receiver && !!receiver.querySelector('h1')?.textContent.trim() && /^[0-9 -]{9,20}$/.test(receiver.querySelector('strong')?.textContent||'') && /\\([0-9]{5}\\)/.test(receiver.querySelector('p')?.textContent||'') && !receiver.textContent.includes('확인 필요')};})()`;

// Remote label scripts stay disabled. Main inspects only fixed DOM fields;
// receiver content is never returned to the app renderer or written to disk.
function createLabelPreview({BrowserWindow,Menu,dialog,getParent}){
  let current=null;
  function close(){const old=current;current=null;if(old&&!old.isDestroyed())old.destroy();}
  function context(){return {labelWebContentsId:current&&!current.isDestroyed()?current.webContents.id:null,labelUrl:current?.labelUrl||null};}
  async function open({hubOrderId,trackingNo,validate,expectedReceiver}={}){
    if(typeof validate!=='function')throw Error('Print validation required');
    if(typeof hubOrderId!=='string'||!/^HR-(?:C24|CP)-[A-F0-9]{8}$/.test(hubOrderId)||typeof trackingNo!=='string'||!/^\d{13}$/.test(trackingNo))throw Error('Invalid label target');
    close();const parent=getParent();if(!parent||parent.isDestroyed())return {status:'PRINT_UNAVAILABLE'};
    const clean=value=>typeof value==='string'?value.trim().replace(/\s+/g,' '):'';
    const receiver=expectedReceiver;
    if(!clean(receiver?.name)||!clean(receiver?.address)||!/^\d{5}$/.test(receiver?.postCode||'')||!/^\d{9,12}$/.test((receiver?.contact||'').replace(/[\s-]/g,'')))return {status:'PRINT_UNAVAILABLE'};
    const expected={name:clean(receiver.name),contact:receiver.contact.replace(/[\s-]/g,''),address:clean(`(${receiver.postCode}) ${receiver.address} ${receiver.addressDetail||''}`)};
    const url=`${HARIN_ORIGIN}/api/shipping/print?type=label&ids=${hubOrderId}`;
    const win=new BrowserWindow({parent,width:620,height:820,show:false,title:'모아온 · 송장 미리보기',autoHideMenuBar:false,
      webPreferences:{partition:READONLY_PARTITION,nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true,javascript:false,webviewTag:false,devTools:false,spellcheck:false}});
    current=win;win.labelUrl=url;
    const alive=()=>current===win&&!win.isDestroyed();
    let printing=false,timer;
    async function verify(){
      if(!alive()||win.webContents.getURL()!==url)return false;
      // World 0 follows javascript:false; only this fixed host-owned isolated code runs.
      const inspect=code=>win.webContents.executeJavaScriptInIsolatedWorld(999,[{code}]);
      const data=await inspect(INSPECT);
      const actual=await inspect(`(()=>{const r=document.querySelector('article.label .receiver');return {name:r?.querySelector('h1')?.textContent,contact:r?.querySelector('strong')?.textContent,address:r?.querySelector('p')?.textContent};})()`);
      return alive()&&data?.count===1&&data.id===hubOrderId&&data.invoice===trackingNo&&data.receiverValid===true&&clean(actual?.name)===expected.name&&clean(actual?.contact).replace(/[\s-]/g,'')===expected.contact&&clean(actual?.address)===expected.address;
    }
    const menu=Menu.buildFromTemplate([
      {id:'print',label:'인쇄 설정 열기',enabled:false,click:async()=>{
        if(printing||!alive())return;printing=true;
        try{
          if(!await validate()||!await verify())throw Error();
          const answer=await dialog.showMessageBox(win,{type:'question',title:'기존 송장 인쇄',message:'받는 분과 송장번호를 확인했나요?',detail:'이미 발급된 송장만 인쇄합니다. 실제 용지에 맞춰 프린터 설정을 확인하세요. 기본 문서 크기는 100 × 150mm입니다.',buttons:['취소','인쇄 설정 열기'],defaultId:0,cancelId:0,noLink:true});
          if(answer?.response!==1)return;
          if(!await validate()||!await verify())throw Error();
          await new Promise(resolve=>win.webContents.print({silent:false,printBackground:true,pageSize:{width:100000,height:150000},margins:{marginType:'none'}},success=>{
            if(alive())win.setTitle(success?'인쇄 요청 전달됨 · 실제 출력 확인 필요':'인쇄 취소 또는 실패 · 출력 상태 확인');resolve();
          }));
        }catch{if(alive())win.setTitle('문서 확인 실패 · 창을 닫고 다시 확인하세요');}
        finally{printing=false;}
      }},
      {label:'닫기',click:()=>{if(alive())close();}},
    ]);
    win.setMenu(menu);
    win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
    for(const eventName of ['will-navigate','will-redirect','will-attach-webview'])win.webContents.on(eventName,event=>{event.preventDefault();if(alive())close();});
    win.webContents.on('did-navigate',(_event,target,code)=>{if(target!==url||code!==200){if(alive())close();}});
    win.on('closed',()=>{if(current===win)current=null;});
    try{
      await Promise.race([(async()=>{await win.loadURL(url);if(!await verify())throw Error();await win.webContents.insertCSS('.actions{display:none!important}');})(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Label timeout')),15000);})]);
      if(!alive())return {status:'PRINT_UNAVAILABLE'};
      menu.getMenuItemById('print').enabled=true;win.show();return {status:'PREVIEW_OPEN'};
    }catch{if(alive())close();return {status:'PRINT_UNAVAILABLE'};}
    finally{clearTimeout(timer);}
  }
  return Object.freeze({open,close,context});
}
module.exports={createLabelPreview};
