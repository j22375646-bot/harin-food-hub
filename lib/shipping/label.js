'use strict';

const PATTERNS=['212222','222122','222221','121223','121322','131222','122213','122312','132212','221213','221312','231212','112232','122132','122231','113222','123122','123221','223211','221132','221231','213212','223112','312131','311222','321122','321221','312212','322112','322211','212123','212321','232121','111323','131123','131321','112313','132113','132311','211313','231113','231311','112133','112331','132131','113123','113321','133121','313121','211331','231131','213113','213311','213131','311123','311321','331121','312113','312311','332111','314111','221411','431111','111224','111422','121124','121421','141122','141221','112214','112412','122114','122411','142112','142211','241211','221114','413111','241112','134111','111242','121142','121241','114212','124112','124211','411212','421112','421211','212141','214121','412121','111143','111341','131141','114113','114311','411113','411311','113141','114131','311141','411131','211412','211214','211232','2331112'];

const text=value=>value==null?'':String(value).trim();
const escapeHtml=value=>text(value).replace(/[&<>"']/g,char=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[char]));

function code128Values(value) {
  const normalized=text(value);
  if(!/^\d{13}$/.test(normalized))throw new Error('송장 바코드는 숫자 13자리만 만들 수 있습니다.');
  const values=[104,normalized.charCodeAt(0)-32,99];
  for(let index=1;index<normalized.length;index+=2)values.push(Number(normalized.slice(index,index+2)));
  const checksum=(values[0]+values.slice(1).reduce((sum,item,index)=>sum+item*(index+1),0))%103;
  return [...values,checksum,106];
}

function barcodeSvg(value,{height=64,moduleWidth=2}={}) {
  const values=code128Values(value);
  const quiet=10*moduleWidth;
  let x=quiet;
  const rects=[];
  for(const code of values){
    const widths=PATTERNS[code];
    for(let index=0;index<widths.length;index+=1){
      const width=Number(widths[index])*moduleWidth;
      if(index%2===0)rects.push(`<rect x="${x}" y="0" width="${width}" height="${height}"/>`);
      x+=width;
    }
  }
  const width=x+quiet;
  return `<svg class="trackingBarcode" viewBox="0 0 ${width} ${height}" role="img" aria-label="우체국 송장 ${escapeHtml(value)}" xmlns="http://www.w3.org/2000/svg"><g fill="#000">${rects.join('')}</g></svg>`;
}

function normalizeReceiver(raw={}) {
  const receiver=Array.isArray(raw.receivers)?raw.receivers[0]:raw.receiver||raw.receivers||raw.shipping_address||raw.shipping||raw;
  return {
    name:text(receiver.name||receiver.receiver_name||receiver.recipient_name),
    contact:text(receiver.virtual_phone_no||receiver.cellphone||receiver.phone||receiver.safeNumber||receiver.receiverNumber),
    postCode:text(receiver.zipcode||receiver.zip_code||receiver.post_code||receiver.postCode),
    address:text(receiver.address_full||receiver.address1||receiver.addr1||receiver.address||receiver.base_address),
    addressDetail:text(receiver.address2||receiver.addr2||receiver.address_detail||receiver.detail_address),
    message:text(receiver.shipping_message||receiver.deliveryMessage||receiver.message)
  };
}

module.exports={barcodeSvg,code128Values,escapeHtml,normalizeReceiver};
