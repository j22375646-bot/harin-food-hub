'use strict';

function removeDeletedAnalysis({history=[],active=null,deletedId}={}){
  const id=String(deletedId||'');
  const nextHistory=(history||[]).filter(item=>String(item?.id||'')!==id);
  const nextActive=String(active?.id||'')===id?(nextHistory[0]||null):active;
  return {history:nextHistory,active:nextActive};
}

module.exports={removeDeletedAnalysis};
