'use strict';
const exact=(v,k)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===k.length&&k.every(x=>Object.hasOwn(v,x));
const uuid=x=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(x);
const text=(x,n)=>typeof x==='string'&&!!x.trim()&&x.length<=n;
const rev=x=>Number.isSafeInteger(x)&&x>=0&&x<2147483647;
function valid(v,worker=false){switch(v?.action){
case 'LEARN_READ':return !worker&&exact(v,['action']);
case 'LEARN_SUBMIT':return worker&&exact(v,['action','id','title','body','source','targetId','baseRevision'])&&uuid(v.id)&&text(v.title,160)&&text(v.body,7200)&&text(v.source,300)&&(v.targetId===null&&v.baseRevision===0||uuid(v.targetId)&&rev(v.baseRevision)&&v.baseRevision>0);
case 'LEARN_EDIT':return !worker&&exact(v,['action','id','revision','title','body','source'])&&uuid(v.id)&&rev(v.revision)&&text(v.title,160)&&text(v.body,7200)&&text(v.source,300);
case 'LEARN_APPROVE':case 'LEARN_REJECT':return !worker&&exact(v,['action','id','revision'])&&uuid(v.id)&&rev(v.revision);
default:return false;}}
module.exports={valid};
