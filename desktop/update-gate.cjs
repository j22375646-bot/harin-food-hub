'use strict';
function createUpdateGate(){
 let active=0,paused=false;const waiters=new Set();
 const settle=value=>{for(const resolve of waiters)resolve(value);waiters.clear();};
 return Object.freeze({
  async run(operation){if(paused)throw Error('UPDATE_RESTART_PENDING');active++;try{return await operation();}finally{active--;if(!active&&paused)settle(true);}},
  pause(){if(paused||active)return false;paused=true;return true;},
  pauseWhenIdle(){paused=true;if(!active)return Promise.resolve(true);return new Promise(resolve=>waiters.add(resolve));},
  resume(){paused=false;settle(false);},
  busy:()=>active>0,
 });
}
function guardWorkIpc(ipcMain,gate){return {handle:(channel,handler)=>ipcMain.handle(channel,(...args)=>gate.run(()=>handler(...args)))};}
module.exports={createUpdateGate,guardWorkIpc};
