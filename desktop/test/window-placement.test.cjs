const test=require('node:test'),assert=require('node:assert/strict');
const {rightDisplayBounds}=require('../window-placement.cjs');
test('right launch stays inside the nearest secondary monitor including negative y',()=>{
 const primary={id:1,workArea:{x:0,y:0,width:2560,height:1392}};
 const right={id:2,workArea:{x:2560,y:-72,width:1080,height:1872}};
 const b=rightDisplayBounds([primary,right],primary);
 assert.deepEqual(b,{x:2570,y:-42,width:1060,height:960});
 assert.equal(rightDisplayBounds([primary,{id:3,workArea:{x:-1920,y:0,width:1920,height:1080}}],primary),null);
 assert.equal(rightDisplayBounds([primary],primary),null);
});
