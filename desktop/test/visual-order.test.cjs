'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {projectOrdersPayload}=require('../hub-connection.cjs');
const {isImageRequest}=require('../order-visual.cjs');
const project=order=>projectOrdersPayload({ok:true,orders:[order],total:1,offset:0,nextOffset:null,snapshot:'a'.repeat(64),partial:false},'2026-09-09T00:00:00Z').orders[0];
test('visual order preserves trusted image and server gift instead of inferring from amount',()=>{
 const row=project({items:[{imageUrl:'https://shop-phinf.pstatic.net/product/tea.jpg'}],giftRequired:true,gifts:[{giftName:'보리차',quantity:2}],amount:30000});
 assert.equal(row.visual?.imageUrl,'https://shop-phinf.pstatic.net/product/tea.jpg');
 assert.deepEqual(row.visual.gifts,[{name:'보리차',quantity:2}]);
 assert.equal(project({amount:30000}).visual,undefined);
});
test('unsafe images and malformed gifts never reach renderer',()=>{
 for(const imageUrl of ['http://127.0.0.1/x','https://shop-phinf.pstatic.net.evil.test/x','file:///secret','https://user:pass@shop-phinf.pstatic.net/x']){
  assert.equal(project({items:[{imageUrl}]}).visual,undefined);
 }
 assert.equal(project({giftRequired:false,gifts:[{giftName:'차',quantity:1}]}).visual,undefined);
 assert.equal(project({giftRequired:true,gifts:[{giftName:'차',quantity:0}]}).visual,undefined);
});
test('CDN access is limited to image requests, including redirects',()=>{
 assert.equal(isImageRequest({url:'https://thumbnail.coupangcdn.com/thumbnails/test.jpg',resourceType:'image'}),true);
 for(const resourceType of ['script','xhr','mainFrame','subFrame'])assert.equal(isImageRequest({url:'https://thumbnail.coupangcdn.com/test',resourceType}),false);
 assert.equal(isImageRequest({url:'https://127.0.0.1/test',resourceType:'image'}),false);
});
