'use strict';

function normalizeServiceKey(value){
  const key=String(value||'').trim();
  if(!key)return '';
  try{return decodeURIComponent(key);}catch{return key;}
}

module.exports={normalizeServiceKey};
