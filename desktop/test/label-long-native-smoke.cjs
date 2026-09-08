'use strict';
const {app,BrowserWindow,Menu}=require('electron');
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const root=process.argv.includes('--packaged')?path.resolve(__dirname,'../dist/win-unpacked/resources/app.asar'):path.resolve(__dirname,'..');
const {createLabelPreview}=require(path.join(root,'label-preview.cjs'));
app.setPath('userData',fs.mkdtempSync(path.join(os.tmpdir(),'moaon-label-long-')));
app.whenReady().then(async()=>{
 let parent,preview;
 try{
  parent=new BrowserWindow({show:false});
  preview=createLabelPreview({BrowserWindow,Menu,dialog:{showMessageBox:async()=>({response:0})},getParent:()=>parent});
  const base={hubOrderId:'HR-C24-1234ABCD',trackingNo:'1234567890123',goodsName:'합성 검증용 국내산 식품 선물 세트 구성 선택 상품 '.repeat(3).slice(0,69),quantity:3,businessName:'하린식품',channelLabel:'CAFE24',expectedReceiver:{name:'합성검증인',contact:'01012345678',postCode:'12345',address:'합성특별시 가상구 검증동 시험도로 123번길 456 합성아파트 가상동 1234호 검증용 주소'.padEnd(54,'가'),addressDetail:'',message:'합성 요청사항입니다 문 앞 배송 후 연락 바랍니다'}};
  const labels=[base,{...base,hubOrderId:'HR-CP-ABCDEF12',trackingNo:'9876543210123',channelLabel:'COUPANG'}];
  assert.equal((await preview.open({labels,validate:async()=>true})).status,'PREVIEW_OPEN','normal multiline Korean contents must fit without truncation');
  const child=BrowserWindow.getAllWindows().find(win=>win!==parent);
  const sizes=await child.webContents.executeJavaScriptInIsolatedWorld(999,[{code:`Array.from(document.querySelectorAll('article.label'),row=>({height:row.getBoundingClientRect().height,width:row.getBoundingClientRect().width,overflow:row.scrollWidth>row.clientWidth+1}))`}]);
  assert.equal(sizes.length,2);assert.ok(sizes.every(row=>row.height<=568&&row.width<=379&&!row.overflow));
  assert.equal((await preview.open({labels:[base,{...labels[1],goodsName:'가'.repeat(1500)}],validate:async()=>true})).status,'PRINT_UNAVAILABLE','excessive content must still fail closed');
  console.log(JSON.stringify({status:'PASS',packaged:process.argv.includes('--packaged'),scope:'synthetic multiline Korean batch fits 100x150; oversized second label rejected; no printing',sizes}));
  preview.close();parent.destroy();app.exit(0);
 }catch(error){console.error(error);preview?.close();parent?.destroy();app.exit(1);}
});
