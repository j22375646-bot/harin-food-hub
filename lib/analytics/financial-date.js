'use strict';
function seoulDateKey(value){
 const text=String(value||'');
 if(/^\d{4}-\d{2}-\d{2}$/.test(text))return text;
 const at=Date.parse(text);
 return Number.isFinite(at)?new Date(at+9*60*60*1000).toISOString().slice(0,10):'';
}
module.exports={seoulDateKey};
