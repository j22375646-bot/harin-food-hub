import authModule from '../../../../../lib/dashboard-auth.js';
import apiSafety from '../../../../../lib/api/safety.js';
import cafe24Client from '../../../../../lib/cafe24/client.js';
import cafe24Config from '../../../../../lib/cafe24/config.js';

export const runtime='nodejs';
export const dynamic='force-dynamic';

const text=value=>value==null?'':String(value).trim();

function normalizedReceiver(payload={}) {
  const receiver=Array.isArray(payload.receivers)?payload.receivers[0]:payload.receiver || payload.receivers || {};
  return {
    name:text(receiver.name),
    contact:text(receiver.virtual_phone_no || receiver.cellphone || receiver.phone),
    postCode:text(receiver.zipcode || receiver.post_code),
    address:text(receiver.address_full || receiver.address1),
    addressDetail:text(receiver.address2),
    message:text(receiver.shipping_message)
  };
}

export async function GET(request) {
  if(!apiSafety.isAuthorized(request,authModule))return apiSafety.unauthorized();
  try {
    const orderId=text(new URL(request.url).searchParams.get('orderId'));
    if(!/^[A-Za-z0-9_-]{1,80}$/.test(orderId))return apiSafety.json({ok:false,error:'Cafe24 주문번호를 확인하세요.'},{status:400});
    const result=await cafe24Client.adminGet(cafe24Config.getConfig(),`/orders/${encodeURIComponent(orderId)}/receivers`);
    const receiver=normalizedReceiver(result.payload || {});
    if(!receiver.name && !receiver.contact && !receiver.address)return apiSafety.json({ok:false,error:'배송정보가 아직 생성되지 않았습니다.'},{status:404});
    return apiSafety.json({ok:true,receiver});
  } catch(error) {
    console.error('[cafe24 delivery detail]',{status:error.status||500,message:error.message});
    const status=Number(error.status)||502;
    return apiSafety.json({ok:false,error:status===401?'Cafe24를 다시 연결해주세요.':'Cafe24 배송정보를 불러오지 못했습니다.'},{status});
  }
}
