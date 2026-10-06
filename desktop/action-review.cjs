'use strict';
const {randomUUID}=require('node:crypto');
// Main owns the frozen review, recipient, one-use token and expiry. The
// original workflow still revalidates its order fingerprint after approval.
function createActionReview({ipcMain,getMainWindow,isTrustedRenderer,timeoutMs=120000}){
  let pending=null;
  function finish(response){
    const item=pending;if(!item)return;pending=null;
    clearTimeout(item.timer);item.window.removeListener('closed',item.closed);
    item.window.webContents.removeListener('did-start-navigation',item.closed);
    if(!item.window.isDestroyed())item.window.webContents.send('moaon-hub:action-review',{closed:true,token:item.token});
    item.resolve({response});
  }
  ipcMain.handle('moaon-hub:answer-review',(event,token,response)=>{
    if(!pending||!isTrustedRenderer(event,pending.window)||getMainWindow()!==pending.window||token!==pending.token||![0,1].includes(response))return false;
    finish(response);return true;
  });
  return (window,options)=>new Promise(resolve=>{
    if(pending||!window||window.isDestroyed()||window!==getMainWindow())return resolve({response:0});
    const token=randomUUID(),closed=()=>finish(0);
    pending={window,token,resolve,closed,timer:setTimeout(closed,timeoutMs)};
    window.once('closed',closed);window.webContents.once('did-start-navigation',closed);
    window.webContents.send('moaon-hub:action-review',{token,title:String(options.title||'작업 확인'),message:String(options.message||''),detail:String(options.detail||''),confirm:String(options.buttons?.[1]||'확인')});
  });
}
module.exports={createActionReview};
