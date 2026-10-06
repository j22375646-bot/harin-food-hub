'use strict';
// Compare only a complete page in the same query scope. Never call newly seen
// historical rows "new orders", or compare across accounts, filters or pages.
(function(root){
 function createOrderChanges(){
  let scope=null,previous=null,pending=new Set(),changed=new Set(),expires=0;
  const fingerprint=o=>JSON.stringify([o.productName,o.stage,o.quantity,o.amount,o.details?.invoice?.status,o.details?.invoice?.number,o.details?.delivery?.status,o.details?.items]);
  return {
   reset(){scope=null;previous=null;pending.clear();changed.clear();expires=0;},
   accept(key,rows,complete,now=Date.now()){
    pending.clear();changed.clear();expires=now+8000;
    if(!complete){this.reset();return;}
    const next=new Map(rows.filter(o=>o.hubOrderId).map(o=>[o.hubOrderId,fingerprint(o)]));
    if(scope===key&&previous)for(const [id,value]of next)if(!previous.has(id)||previous.get(id)!==value)pending.add(id);
    scope=key;previous=next;
    changed=new Set(pending);
   },
   has(id,now=Date.now()){return now<=expires&&changed.has(id);},
   remaining(now=Date.now()){return Math.max(0,expires-now);},
   take(id,now=Date.now()){if(now>expires){pending.clear();return false;}return pending.delete(id);}
  };
 }
 if(typeof module==='object'&&module.exports){module.exports={createOrderChanges};return;}
 const orders=createOrderChanges();let toast=null,timer=null;
 function clear(){clearTimeout(timer);if(toast){toast.hidePopover();toast.remove();toast=null;}}
 function notify(message){
  clear();toast=document.createElement('div');toast.className='action-feedback';toast.setAttribute('popover','manual');
  const icon=document.createElement('span');icon.className='action-feedback-check';icon.textContent='✓';icon.setAttribute('aria-hidden','true');
  const text=document.createElement('span');text.setAttribute('role','status');text.setAttribute('aria-live','polite');
  const close=document.createElement('button');close.type='button';close.textContent='×';close.setAttribute('aria-label','완료 안내 닫기');close.onclick=clear;
  toast.append(icon,text,close);document.body.append(toast);toast.showPopover();text.textContent=message;timer=setTimeout(clear,6000);
 }
 root.moaonFeedback={orders,notify,clear};
})(globalThis);
