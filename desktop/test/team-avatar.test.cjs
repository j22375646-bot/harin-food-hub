'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {validAvatar,validInput}=require('../team-contract.cjs');
test('profile pictures allow removal and bounded JPEG frames, reject remote and active content',()=>{
 assert.equal(validAvatar(''),true);
 for(const v of ['https://example.com/a.jpg','data:image/svg+xml;base64,PHN2Zz4=', 'data:image/jpeg;base64,/9j/AAAA','data:image/jpeg;base64,/9j/'+ 'A'.repeat(50000)])assert.equal(validAvatar(v),false);
 const frame=Buffer.from([255,216,255,192,0,17,8,0,128,0,128,3,1,17,0,2,17,0,3,17,0,255,217]);
 const encoded=()=> 'data:image/jpeg;base64,'+frame.toString('base64');
 assert.equal(validAvatar(encoded()),true);frame.writeUInt16BE(3000,7);assert.equal(validAvatar(encoded()),false);
 const profile={action:'PROFILE',name:'Test',title:'',color:'blue',notifications:true,revision:1};
 assert.equal(validInput(profile),true);assert.equal(validInput({...profile,avatar:''}),true);assert.equal(validInput({...profile,avatar:'https://example.com/a'}),false);
});
