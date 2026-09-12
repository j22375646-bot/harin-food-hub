'use strict';
const path=require('node:path');
// Keep Explorer's existing app identity. Repair stale links, never set window
// relaunch icon properties (those previously produced blank taskbar icons).
async function repairShortcuts({shell,fs,appData,desktop,executable,icon,appId}){
 const menu=path.join(appData,'Microsoft','Windows','Start Menu','Programs');
 const pinned=path.join(appData,'Microsoft','Internet Explorer','Quick Launch','User Pinned','TaskBar');
 await fs.mkdir(menu,{recursive:true});const repaired=[];
 for(const directory of [menu,desktop,pinned])for(const name of ['모아온.lnk','Moaon Preview.lnk']){
  const link=path.join(directory,name);let previous=null;
  try{previous=shell.readShortcutLink(link);}catch{}
  if(!previous&&(name!=='모아온.lnk'||directory===pinned))continue;
  if(previous&&path.basename(previous.target||'').toLowerCase()!=='moaonpreview.exe')continue;
  const options={target:executable,cwd:path.dirname(executable),args:previous?.args||'',icon,iconIndex:0,description:'모아온',appUserModelId:appId};
  if(shell.writeShortcutLink(link,previous?'update':'create',options))repaired.push(link);
 }
 return repaired;
}
module.exports={repairShortcuts};
