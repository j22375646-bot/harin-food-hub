'use strict';
// Register close/quit protection immediately, but let the first frame precede
// native Explorer tray creation. This does not eliminate the native work itself.
function createDeferredTrayLifecycle({app,window,create,canHide=()=>true,allowClose=()=>false,onStop=()=>{},setTimer=setTimeout,clearTimer=clearTimeout}){
 let lifecycle=null,timer=null,disposed=false,quitting=false,hidden=false,status;
 const close=event=>{if(disposed||quitting||allowClose())return;event.preventDefault();if(!canHide())return;hidden=true;window.hide();window.setSkipTaskbar(true);};
 const quit=()=>{quitting=true;clearTimer(timer);timer=null;onStop();};
 const ready=()=>{if(disposed||quitting)return;timer=setTimer(()=>{
  timer=null;if(disposed||quitting||window.isDestroyed())return;
  try{lifecycle=create();}catch{lifecycle=null;}
  window.removeListener('close',close);
  app.removeListener('before-quit',quit);app.removeListener('before-quit-for-update',quit);
  window.removeListener('query-session-end',quit);window.removeListener('session-end',quit);
  if(lifecycle?.available){if(status!==undefined)lifecycle.setStatus(status);}
  else if(hidden&&!window.isDestroyed()){window.setSkipTaskbar(false);window.showInactive();}
 },250);timer?.unref?.();};
 window.on('close',close);window.once('ready-to-show',ready);
 window.on('query-session-end',quit);window.on('session-end',quit);
 app.on('before-quit',quit);app.on('before-quit-for-update',quit);
 return {get available(){return Boolean(lifecycle?.available);},setStatus(value){status=value;lifecycle?.setStatus(value);},dispose(){if(disposed)return;disposed=true;clearTimer(timer);timer=null;window.removeListener('close',close);window.removeListener('ready-to-show',ready);window.removeListener('query-session-end',quit);window.removeListener('session-end',quit);app.removeListener('before-quit',quit);app.removeListener('before-quit-for-update',quit);lifecycle?.dispose();}};
}
module.exports={createDeferredTrayLifecycle};
