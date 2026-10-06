'use strict';
function response(v,action){if(action==='LEARN_READ'){if(!v||!Array.isArray(v.proposals)||v.proposals.length>100||!Array.isArray(v.knowledge)||v.knowledge.length>100)throw Error('INVALID');for(const p of v.proposals)if(typeof p.id!=='string'||!Number.isSafeInteger(p.revision)||!['PENDING','APPROVED','REJECTED'].includes(p.status)||['title','body','source'].some(k=>typeof p[k]!=='string'))throw Error('INVALID');return v;}if(v?.saved!==true)throw Error('INVALID');return {saved:true,id:v.id,status:v.status};}
module.exports={response};
