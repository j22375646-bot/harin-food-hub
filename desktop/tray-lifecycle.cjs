'use strict';
function createTrayLifecycle({app,Tray,Menu,window,icon,onStop=()=>{},canHide=()=>true,allowClose=()=>false}){
 let quitting=false,status='로그인 후 알림 확인',tray;
 const open=()=>{if(window.isDestroyed())return;if(window.isMinimized())window.restore();window.setSkipTaskbar(false);window.show();window.focus();window.webContents.send('moaon-hub:window-restored');};
 const stop=()=>{quitting=true;onStop();};
 const render=()=>{tray.setToolTip('모아온 · '+status);tray.setContextMenu(Menu.buildFromTemplate([{label:'모아온 열기',click:open},{label:status,enabled:false},{type:'separator'},{label:'모아온 종료',click:()=>app.quit()}]));};
 try{tray=new Tray(icon);tray.on('click',open);tray.on('double-click',open);render();}catch{tray?.destroy();return {available:false,setStatus(){},open,dispose(){}};}
 const close=event=>{if(quitting||allowClose())return;event.preventDefault();if(!canHide())return;window.hide();window.setSkipTaskbar(true);};
 window.on('close',close);
 // Update installation can close windows before app.before-quit.
 app.on('before-quit',stop);app.on('before-quit-for-update',stop);
 window.on('query-session-end',stop);window.on('session-end',stop);
 return {available:true,open,setStatus(value){if(status===value)return;status=value;render();},prepareQuit:stop,dispose(){window.removeListener('close',close);window.removeListener('query-session-end',stop);window.removeListener('session-end',stop);app.removeListener('before-quit',stop);app.removeListener('before-quit-for-update',stop);tray.destroy();}};
}
module.exports={createTrayLifecycle};
