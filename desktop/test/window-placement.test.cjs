const test=require('node:test'),assert=require('node:assert/strict');
const {defaultWindowBounds,rightDisplayBounds}=require('../window-placement.cjs');
const {readRightDisplayPreference,saveRightDisplayPreference,showRightWindow}=require('../window-placement.cjs');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
test('right display choice survives a restart without command-line flags',()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'moaon-display-')),file=path.join(directory,'display.json');
 try{assert.equal(readRightDisplayPreference(file),false);saveRightDisplayPreference(file);assert.equal(readRightDisplayPreference(file),true);assert.equal(fs.existsSync(file+'.tmp'),false);saveRightDisplayPreference(file);assert.equal(readRightDisplayPreference(file),true);}
 finally{fs.unlinkSync(file);fs.rmdirSync(directory);}
});
test('damaged or unknown preferences cannot silently fall back to the main monitor',()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'moaon-display-invalid-')),file=path.join(directory,'display.json');
 try{for(const data of ['{',JSON.stringify({version:2,display:'right'}),JSON.stringify({version:1,display:'left'}),'x'.repeat(257)]){fs.writeFileSync(file,data);assert.throws(()=>readRightDisplayPreference(file),/DISPLAY_PREFERENCE_UNAVAILABLE/);}}
 finally{fs.unlinkSync(file);fs.rmdirSync(directory);}
});
test('repeat launch uses inactive reveal and refuses a missing right display',()=>{
 const calls=[],window={setMinimumSize:()=>calls.push('minimum'),setBounds:()=>calls.push('bounds'),showInactive:()=>calls.push('inactive')};
 const primary={id:1,workArea:{x:0,y:0,width:1920,height:1080}},right={id:2,workArea:{x:1920,y:0,width:1080,height:1920}};
 assert.equal(showRightWindow(window,[primary],primary),false);assert.deepEqual(calls,[]);
 assert.equal(showRightWindow(window,[primary,right],primary),true);assert.deepEqual(calls,['minimum','bounds','inactive']);
});
test('right launch stays inside the nearest secondary monitor including negative y',()=>{
 const primary={id:1,workArea:{x:0,y:0,width:2560,height:1392}};
 const right={id:2,workArea:{x:2560,y:-72,width:1080,height:1872}};
 const b=rightDisplayBounds([primary,right],primary);
 assert.deepEqual(b,{x:2570,y:344,width:1060,height:1040});
 assert.equal(rightDisplayBounds([primary,{id:3,workArea:{x:-1920,y:0,width:1920,height:1080}}],primary),null);
 assert.equal(rightDisplayBounds([primary],primary),null);
});

test('default launch is large and centered while fitting small and scaled work areas',()=>{
 for(const area of [{x:0,y:0,width:2560,height:1392},{x:1920,y:-100,width:1920,height:1040},{x:-1280,y:20,width:1280,height:680}]){
  const b=defaultWindowBounds({workArea:area});
  assert.equal(b.width,Math.min(1660,area.width-20));assert.equal(b.height,Math.min(1040,area.height-20));
  assert.ok(b.x>=area.x&&b.y>=area.y);assert.ok(b.x+b.width<=area.x+area.width&&b.y+b.height<=area.y+area.height);
 }
 assert.deepEqual(defaultWindowBounds({workArea:{x:0,y:0,width:2560,height:1392}}),{x:450,y:176,width:1660,height:1040});
});
