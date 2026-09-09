'use strict';
const fs=require('node:fs'),path=require('node:path');
function readRightDisplayPreference(file){
 try{
  if(fs.statSync(file).size>256)throw Error('INVALID_DISPLAY_PREFERENCE');
  const value=JSON.parse(fs.readFileSync(file,'utf8'));
  if(value?.version!==1||value?.display!=='right'||Object.keys(value).length!==2)throw Error('INVALID_DISPLAY_PREFERENCE');
  return true;
 }catch(error){if(error.code==='ENOENT')return false;throw Error('DISPLAY_PREFERENCE_UNAVAILABLE');}
}
function saveRightDisplayPreference(file){
 fs.mkdirSync(path.dirname(file),{recursive:true});
 const temporary=file+'.tmp';
 fs.writeFileSync(temporary,JSON.stringify({version:1,display:'right'}),'utf8');
 fs.renameSync(temporary,file);
}
function rightDisplayBounds(displays,primary){
 const d=displays.filter(d=>d.id!==primary.id&&d.workArea.x>=primary.workArea.x+primary.workArea.width).sort((a,b)=>a.workArea.x-b.workArea.x)[0];
 if(!d||d.workArea.width<400||d.workArea.height<400)return null;
 return {x:d.workArea.x+10,y:d.workArea.y+30,width:Math.min(1440,d.workArea.width-20),height:Math.min(960,d.workArea.height-60)};
}
function showRightWindow(window,displays,primary){
 const bounds=rightDisplayBounds(displays,primary);if(!bounds)return false;
 window.setMinimumSize(Math.min(1040,bounds.width),Math.min(720,bounds.height));
 window.setBounds(bounds);window.showInactive();return true;
}
module.exports={rightDisplayBounds,readRightDisplayPreference,saveRightDisplayPreference,showRightWindow};
