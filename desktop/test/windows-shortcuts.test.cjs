'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {repairShortcuts}=require('../windows-shortcuts.cjs');
test('repairs known stale links and sets a stable ICO and identity; preserves args',async()=>{
 const writes=[],shell={readShortcutLink(p){if(p.endsWith('Moaon Preview.lnk'))return {target:'D:/removed/MoaonPreview.exe',args:'--main-display',icon:'D:/removed/MoaonPreview.exe'};throw Error('missing');},writeShortcutLink(...args){writes.push(args);return true;}};
 await repairShortcuts({shell,fs:{mkdir:async()=>{}},appData:'D:/profile',desktop:'D:/desktop',executable:'D:/current/MoaonPreview.exe',icon:'D:/profile/moaon.ico',appId:'com.moaon.desktop.main'});
 assert.equal(writes.length,5);for(const [link,mode,options]of writes){assert.equal(options.icon,'D:/profile/moaon.ico');assert.equal(options.appUserModelId,'com.moaon.desktop.main');assert.equal(options.target,'D:/current/MoaonPreview.exe');assert.equal('appIconPath' in options,false);if(link.endsWith('Moaon Preview.lnk')){assert.equal(mode,'update');assert.equal(options.args,'--main-display');}}
});
test('does not overwrite unrelated shortcuts or create a pinned link',async()=>{
 const writes=[],shell={readShortcutLink(){return {target:'D:/other/App.exe'};},writeShortcutLink(...args){writes.push(args);return true;}};
 assert.deepEqual(await repairShortcuts({shell,fs:{mkdir:async()=>{}},appData:'D:/profile',desktop:'D:/desktop',executable:'D:/current/MoaonPreview.exe',icon:'D:/fixed.ico',appId:'test'}),[]);assert.equal(writes.length,0);
});

test('unchanged shortcuts cause no Explorer writes on repeated startup',async()=>{
 const executable='D:/current/MoaonPreview.exe',icon='D:/profile/moaon.ico',appId='com.moaon.desktop.main';let writes=0;
 const shell={readShortcutLink:()=>({target:executable,cwd:path.dirname(executable),args:'',icon,iconIndex:0,description:'모아온',appUserModelId:appId}),writeShortcutLink:()=>{writes++;return true;}};
 assert.deepEqual(await repairShortcuts({shell,fs:{mkdir:async()=>{}},appData:'D:/profile',desktop:'D:/desktop',executable,icon,appId}),[]);assert.equal(writes,0);
});
