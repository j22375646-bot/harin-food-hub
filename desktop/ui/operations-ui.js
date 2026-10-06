'use strict';
(()=>{
 const node=(tag,text,css='')=>{const n=document.createElement(tag);n.textContent=text;n.className=css;return n;};
 const button=(text,fn)=>{const b=node('button',text);b.type='button';b.onclick=fn;return b;};
 const message=code=>({TEAM_CONFLICT:'다른 PC에서 수정했습니다. 새로 조회한 뒤 다시 저장하세요.',TEAM_BUSY:'다른 작업을 처리 중입니다. 잠시 후 다시 시도하세요.',TEAM_AUTH_REQUIRED:'다시 로그인해 주세요.',TEAM_RESULT_UNKNOWN:'저장 결과를 확인하지 못했습니다. 새로 조회해 반영 여부를 확인하세요.',RESERVATION_EXPIRY:'행사 기간까지 사용할 수 있는 유통기한의 재고를 선택하세요.',RESERVATION_EXCEEDS_STOCK:'다른 행사에 확보한 수량을 포함하면 보유 재고를 넘습니다.',TEAM_INVALID:'입력값과 선택한 행사·재고를 확인하세요.'})[code]||'연결을 확인하지 못했습니다. 새로 조회해 주세요.';
 async function request(input){let r;for(let i=0;i<8;i++){r=await window.moaonHub.teamCommand(input).catch(()=>({ok:false,code:'TEAM_RESULT_UNKNOWN'}));if(r.code!=='TEAM_BUSY')return r;await new Promise(resolve=>setTimeout(resolve,250));}return r;}
 function field(parent,label,type='text',value=''){const l=node('label',label),input=node(type==='textarea'?'textarea':type==='select'?'select':'input','');if(!['textarea','select'].includes(type))input.type=type;input.setAttribute('aria-label',label);input.value=value;l.append(input);parent.append(l);return input;}
 window.MoaonOperationsUI=Object.freeze({node,button,message,request,field});
})();
