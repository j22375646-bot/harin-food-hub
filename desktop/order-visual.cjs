'use strict';
// Public product CDN images only; never allow arbitrary customer-supplied hosts.
function safeImage(value){
 if(typeof value!=='string'||value.length>2048)return '';
 try{
  const url=new URL(value);
  if(url.protocol!=='https:'||url.username||url.password||url.port||url.hash)return '';
  const host=url.hostname;
  if(host==='harinfood.com')return /^\/web\/product\/[a-zA-Z0-9_./-]+\.(?:png|jpe?g|webp|gif)$/i.test(url.pathname)?url.href:'';
  if(!['shop-phinf.pstatic.net','shopping-phinf.pstatic.net','thumbnail.coupangcdn.com','image.coupangcdn.com'].includes(host)&&
     !/^image[0-9]+\.coupangcdn\.com$/.test(host)&&host!=='ecimg.cafe24img.com'&&
     !/^[a-z0-9-]+\.cafe24img\.com$/.test(host)&&host!=='ecimg.cafe24.com')return '';
  return url.href;
 }catch{return '';}
}
function projectVisual(order){
 const imageUrl=(Array.isArray(order?.items)?order.items:[]).slice(0,8).map(item=>safeImage(item?.imageUrl)).find(Boolean)||'';
 const gifts=order?.giftRequired===true&&Array.isArray(order.gifts)?order.gifts.slice(0,8)
  .filter(gift=>typeof gift?.giftName==='string'&&gift.giftName.trim()&&Number.isSafeInteger(gift.quantity)&&gift.quantity>0&&gift.quantity<=999)
  .map(gift=>Object.freeze({name:gift.giftName.trim().slice(0,120),quantity:gift.quantity})):[];
 return imageUrl||gifts.length?Object.freeze({imageUrl,gifts:Object.freeze(gifts)}):undefined;
}
function isImageRequest(details){return details?.resourceType==='image'&&Boolean(safeImage(details.url));}
module.exports={safeImage,projectVisual,isImageRequest};
