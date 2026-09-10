'use strict';
const FIELDS=['name','lot','manufactured','expires','storage','unit','quantity','note'];
function validate(row){
 if(!row||typeof row!=='object'||Array.isArray(row))throw Error('입력 내용을 확인하세요.');
 const out={};for(const k of FIELDS){if(k==='quantity')continue;if(typeof row[k]!=='string'||row[k].length>(k==='note'?1000:200))throw Error('입력 길이를 확인하세요.');out[k]=row[k].trim();}
 if(!out.name||!out.unit)throw Error('상품명과 단위를 입력하세요.');
 for(const k of ['manufactured','expires'])if(out[k]&&(!/^\d{4}-\d{2}-\d{2}$/.test(out[k])||!Number.isFinite(Date.parse(out[k]))||new Date(out[k]).toISOString().slice(0,10)!==out[k]))throw Error('날짜를 확인하세요.');
 if(out.manufactured&&out.expires&&out.expires<out.manufactured)throw Error('유통기한은 제조일자 이후여야 합니다.');
 if(typeof row.quantity!=='number'||!Number.isFinite(row.quantity)||row.quantity<0||row.quantity>1e9||Math.abs(Math.round(row.quantity*1000)-row.quantity*1000)>1e-6)throw Error('수량은 0 이상, 소수 셋째 자리까지 입력하세요.');out.quantity=row.quantity;return out;
}

module.exports={validate};
