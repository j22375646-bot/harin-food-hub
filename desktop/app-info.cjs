'use strict';
function registerAppInfo({ipcMain,getMainWindow,isTrustedRenderer,getVersion}){
 ipcMain.handle('moaon-hub:app-info',async(event,...args)=>{
  if(!isTrustedRenderer(event,getMainWindow())||args.length)throw Error('Untrusted app info request');
  const value=getVersion();return {version:typeof value==='string'&&/^\d{1,4}\.\d{1,4}\.\d{1,4}$/.test(value)?value:null};
 });
}
module.exports={registerAppInfo};
