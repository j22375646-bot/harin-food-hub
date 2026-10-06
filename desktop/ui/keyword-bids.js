'use strict';
(()=>{
 let generation=0;const states=new Map();
 const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
 const errors={AUTH_REQUIRED:'다시 로그인해 주세요.',NAVER_BID_WRITE_DISABLED:'서버의 광고 변경 기능이 꺼져 있습니다.',KEYWORD_NOT_ACTIVE:'현재 사용 중인 등록 키워드가 아닙니다. 목록을 새로 조회해 주세요.',CAMPAIGN_NOT_ACTIVE:'광고가 중지되어 변경할 수 없습니다.',GROUP_NOT_ACTIVE:'운영 중인 쇼핑 광고그룹을 다시 선택해 주세요.',GROUP_TYPE_UNSUPPORTED:'이 광고그룹 유형은 아직 직접 입찰을 지원하지 않습니다.',BID_PREVIEW_EXPIRED:'변경안 확인 후 5분이 지났습니다. 현재가를 다시 조회해 주세요.',GROUP_BID_IN_USE:'광고그룹 입찰가를 사용하는 키워드입니다. 그룹 입찰 설정에서 관리해 주세요.',NAVER_AUTOBID_ACTIVE:'네이버 자동입찰이 관리하는 광고입니다.',BID_SNAPSHOT_STALE:'현재 입찰가가 바뀌었습니다. 다시 조회해 주세요.',BID_OUTSIDE_SAFE_RANGE:'표시된 조정 범위 안에서 입력해 주세요.',SINGLE_CHANGE_WINDOW:'최근 7일 안에 이미 변경했습니다. 성과를 확인한 뒤 다시 조정해 주세요.',BID_RESULT_UNKNOWN:'결과를 확인하지 못했습니다. 재실행하지 말고 변경 결과를 조회해 주세요.',BID_RESULT_REQUIRES_REVIEW:'진행 중이거나 검토가 필요한 변경입니다. 결과를 조회해 주세요.',BID_BUSY:'다른 입찰 요청을 처리 중입니다.',BID_REQUEST_NOT_FOUND:'이 계정의 변경 요청을 찾을 수 없습니다.'};
 function mount(parent,row,search){
  const box=el('section','keyword-bid-desk');parent.append(box);box.append(el('h3','','입찰 운영'));
  if(search||! /^(nkw|grp)-/.test(row.id)){box.append(el('p','','실제 검색어에는 개별 입찰가가 없습니다. 등록 광고 키워드를 선택하면 현재 입찰가를 조회하고 변경할 수 있습니다.'));return;}
  const group=String(row.id).startsWith('grp-'),prefix=group?'GROUP_':'';
 const epoch=generation;let state=states.get(row.id)||{busy:false,live:null,preview:null,message:''};states.set(row.id,state);
  const body=el('div');box.append(body);
  const button=(label,fn)=>{const b=el('button','',label);b.type='button';b.disabled=state.busy;b.onclick=fn;return b;};
  async function call(input){state.busy=true;render();let r;try{r=await window.moaonHub.keywordBid({...input,action:prefix+input.action});}catch{r={ok:false,code:'BID_RESULT_UNKNOWN'};}if(epoch!==generation)return;state.busy=false;if(!r.ok)state.message=errors[r.code]||'입찰 상태를 확인하지 못했습니다. 연결과 광고 설정을 확인해 주세요.';return r;}
  async function refresh(){const r=await call({action:'READ',keywordId:row.id});if(r?.ok){state.live=r;state.preview=null;state.message='네이버 현재 입찰가를 확인했습니다.';}render();}
  function render(){
   if(epoch!==generation||!box.isConnected)return;body.replaceChildren();
   const status=el('p','keyword-bid-status',state.busy?'네이버와 변경 상태를 확인하고 있습니다…':state.message);status.setAttribute('role','status');body.append(status);
   if(!state.live){body.append(button('현재 입찰가 조회',refresh));return;}
   const live=state.live;body.append(el('p','keyword-bid-current',state.preview?.state==='VERIFIED'?`반영 확인 ${state.preview.bid.toLocaleString('ko-KR')}원`:`조회한 입찰가 ${live.currentBid.toLocaleString('ko-KR')}원`),el('small','',`${new Date(live.checkedAt).toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit',hour12:false})} 네이버 조회 · 10원 단위`));
   body.append(el('p','',group?'광고그룹 기본 입찰가입니다. 기본 입찰가를 사용하는 상품에 적용되며, 개별 입찰가가 지정된 상품은 바뀌지 않습니다. 증액하면 광고비가 늘어날 수 있습니다.':'원가·상품별 허용 광고비가 확인되기 전에는 감액만 가능합니다. 기존 웹허브 정책에 따라 7일 내 중복 변경을 제한합니다.'));
   if(!live.writeEnabled)body.append(el('p','keyword-bid-warning','서버 광고 변경 꺼짐 · 현재가 조회와 변경안 확인만 가능합니다.'));
   if(state.preview){
    const p=state.preview,review=el('div','keyword-bid-review');review.append(el('strong','',`${p.currentBid.toLocaleString('ko-KR')}원 → ${p.bid.toLocaleString('ko-KR')}원`));
    if(p.state==='PREVIEWED'){
     review.append(el('p','','확인하면 네이버 입찰가를 변경하고 반영 값을 다시 조회합니다.'));
     const confirm=button('확인 · 네이버에 반영',async()=>{const r=await call({action:'EXECUTE',requestId:p.requestId,confirm:true});if(r?.ok){state.preview=r;state.message=r.state==='VERIFIED'?'네이버 반영과 재조회 검증이 완료되었습니다.':'변경 결과를 확인해 주세요.';}else if(r)state.preview={...p,state:'UNKNOWN'};render();});confirm.disabled=state.busy||!live.writeEnabled;review.append(confirm,button('변경안 취소',()=>{state.preview=null;state.message='변경안을 닫았습니다. 네이버에는 반영하지 않았습니다.';render();}));
    }else{
     if(p.state==='VERIFIED')review.append(button('새 입찰 조정',refresh));
     review.append(el('p','',p.state==='VERIFIED'?'반영 확인 완료':`변경 상태: ${p.state} · 재실행 전에 결과 확인`));
     review.append(button('변경 결과 조회',async()=>{const r=await call({action:'STATUS',requestId:p.requestId});if(r?.ok){state.preview=r;state.message=r.state==='VERIFIED'?'반영 확인 완료':'아직 완료를 확인하지 못했습니다. 변경 기록을 확인해 주세요.';}render();}));
    }
    body.append(review);return;
   }
   const form=el('form','keyword-bid-form'),label=el('label','','변경할 입찰가'),input=el('input');input.type='number';input.min=String(live.minBid);input.max=String(group?live.maxBid:live.currentBid-10);input.step='10';input.required=true;input.placeholder=`${live.minBid} ~ ${group?live.maxBid:Math.max(live.minBid,live.currentBid-10)}원`;input.disabled=state.busy;label.append(input);form.append(label);
   const preview=el('button','','변경안 확인');preview.type='submit';preview.disabled=state.busy||!group&&live.minBid>=live.currentBid;form.append(preview,button('현재가 새로 조회',refresh));
   form.onsubmit=async e=>{e.preventDefault();if(!form.reportValidity()||state.busy)return;const r=await call({action:'PREVIEW',keywordId:row.id,currentBid:live.currentBid,bid:Number(input.value),key:crypto.randomUUID()});if(r?.ok){state.preview=r;state.message='금액을 확인한 뒤 반영해 주세요.';}render();};body.append(form);
  }
  render();
 }
 window.moaonBids={mount,reset:()=>{generation++;states.clear();}};
})();
