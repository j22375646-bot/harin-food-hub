'use strict';
// Port of the web hub's pure Code 128 encoder (lib/shipping/label.js).
// No web server, DB, credentials or external assets are used by this module.
const PATTERNS=['212222','222122','222221','121223','121322','131222','122213','122312','132212','221213','221312','231212','112232','122132','122231','113222','123122','123221','223211','221132','221231','213212','223112','312131','311222','321122','321221','312212','322112','322211','212123','212321','232121','111323','131123','131321','112313','132113','132311','211313','231113','231311','112133','112331','132131','113123','113321','133121','313121','211331','231131','213113','213311','213131','311123','311321','331121','312113','312311','332111','314111','221411','431111','111224','111422','121124','121421','141122','141221','112214','112412','122114','122411','142112','142211','241211','221114','413111','241112','134111','111242','121142','121241','114212','124112','124211','411212','421112','421211','212141','214121','412121','111143','111341','131141','114113','114311','411113','411311','113141','114131','311141','411131','211412','211214','211232','2331112'];
const text=value=>typeof value==='string'?value.trim():'';
const escapeHtml=value=>text(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
function barcodeSvg(value){
 if(!/^\d{13}$/.test(value))throw Error('Invalid tracking number');
 const values=[104,value.charCodeAt(0)-32,99];
 for(let index=1;index<value.length;index+=2)values.push(Number(value.slice(index,index+2)));
 const checksum=(values[0]+values.slice(1).reduce((sum,item,index)=>sum+item*(index+1),0))%103;values.push(checksum,106);
 let x=20;const rects=[];
 for(const code of values)for(let index=0;index<PATTERNS[code].length;index++){
  const width=Number(PATTERNS[code][index])*2;if(index%2===0)rects.push(`<rect x="${x}" y="0" width="${width}" height="64"/>`);x+=width;
 }
 return `<svg class="trackingBarcode" viewBox="0 0 ${x+20} 64" role="img" aria-label="우체국 송장 ${escapeHtml(value)}" xmlns="http://www.w3.org/2000/svg"><g fill="#000">${rects.join('')}</g></svg>`;
}
function renderLabel({hubOrderId,trackingNo,receiver={},goodsName,quantity,businessName='',channelLabel=''}={}){
 if(!/^HR-(?:C24|CP)-[A-F0-9]{8}$/.test(hubOrderId)||!/^\d{13}$/.test(trackingNo)||!Number.isSafeInteger(quantity)||quantity<1)throw Error('Invalid label');
 if(!text(goodsName)||!text(receiver.name)||!text(receiver.address)||!/^\d{5}$/.test(receiver.postCode||'')||!/^\d{9,12}$/.test(text(receiver.contact).replace(/[\s-]/g,'')))throw Error('Incomplete delivery');
 for(const value of [goodsName,businessName,channelLabel,...Object.values(receiver)])if(typeof value!=='string'||value.length>2000)throw Error('Invalid label text');
 const address=[`(${receiver.postCode})`,receiver.address,receiver.addressDetail].filter(Boolean).join(' ');
 return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><title>모아온 송장 미리보기</title><style>
 @page{size:100mm 150mm;margin:0}*{box-sizing:border-box}body{margin:0;background:#eeeaf4;color:#111;font-family:Pretendard,'Malgun Gothic',sans-serif}.preview-note{max-width:100mm;margin:16px auto;font-size:13px;line-height:1.6;color:#51475e}.label{width:100mm;min-height:150mm;margin:16px auto;background:white;padding:4mm;display:flex;flex-direction:column;gap:2mm;overflow-wrap:anywhere}header{display:flex;justify-content:space-between;gap:8px;padding-bottom:2mm;border-bottom:2px solid #111;font-size:12px}header b{font-size:20px}.receiver small{font-size:12px}.receiver h1{font-size:24px;margin:4px 0}.receiver strong{font-size:18px}.receiver p{font-size:18px;line-height:1.35;margin:6px 0}.goods{border-block:1px solid #aaa;padding:2mm 0;display:grid;gap:4px;font-size:14px;line-height:1.35}.barcode{margin-top:auto;text-align:center}.trackingBarcode{width:100%;height:20mm;display:block}.barcode b{display:block;letter-spacing:2px;font-size:19px;margin-top:4px}footer{font-size:10px;color:#444}.preview-note,.label{border-radius:10px}@media print{body{background:white}.preview-note{display:none}.label{margin:0;border-radius:0;width:100mm;min-height:150mm}}
 </style></head><body><p class="preview-note">100 × 150mm · 기존 송장 미리보기<br>인쇄는 상단 메뉴의 ‘인쇄 설정 열기’에서 진행하세요.</p><article class="label"><header><b>우체국택배</b><span>${escapeHtml(businessName)}<br>${escapeHtml(channelLabel)}</span></header><section class="receiver"><small>받는 분</small><h1>${escapeHtml(receiver.name)}</h1><strong>${escapeHtml(receiver.contact)}</strong><p>${escapeHtml(address)}</p></section><section class="goods"><b>${escapeHtml(goodsName)}</b><span>수량 ${quantity}개</span><span>${escapeHtml(receiver.message||'배송 메모 없음')}</span></section><section class="barcode">${barcodeSvg(trackingNo)}<b>${trackingNo}</b></section><footer><span>${hubOrderId}</span></footer></article></body></html>`;
}
function renderLabels(labels){
 if(!Array.isArray(labels)||labels.length<1||labels.length>20||new Set(labels.map(row=>row.hubOrderId)).size!==labels.length||new Set(labels.map(row=>row.trackingNo)).size!==labels.length)throw Error('Invalid label batch');
 const documents=labels.map(renderLabel);
 const articles=documents.map(html=>html.slice(html.indexOf('<article class="label">'),html.indexOf('</body>')));
 return documents[0].replace(/<article class="label">[\s\S]*<\/body>/,articles.join('')+'</body>').replace('</style>','@media print{.label{break-after:page;page-break-after:always;break-inside:avoid}.label:last-child{break-after:auto;page-break-after:auto}}</style>');
}
module.exports={renderLabel,renderLabels,barcodeSvg};
