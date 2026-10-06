'use strict';
function createUpdateGate(){
 let active=0,paused=false;
 return Object.freeze({
  async run(operation){if(paused)throw Error('UPDATE_RESTART_PENDING');active++;try{return await operation();}finally{active--; }},
  pause(){if(paused||active)return false;paused=true;return true;},
  resume(){paused=false;},
  busy:()=>active>0,
 });
}
function guardWorkIpc(ipcMain,gate){return {handle:(channel,handler)=>ipcMain.handle(channel,(...args)=>gate.run(()=>handler(...args)))};}
module.exports={createUpdateGate,guardWorkIpc};
