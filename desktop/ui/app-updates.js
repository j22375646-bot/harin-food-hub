'use strict';
(()=>{
 const hub=window.moaonHub,status=document.getElementById('app-update-status'),progress=document.getElementById('app-update-progress');
 const check=document.getElementById('app-update-check'),download=document.getElementById('app-update-download'),restart=document.getElementById('app-update-restart'),ready=document.getElementById('update-ready-open');
 const labels={SETUP_REQUIRED:'자동 업데이트 배포 준비 중입니다.',IDLE:'새 버전을 확인할 수 있습니다.',CHECKING:'새 버전을 확인하고 있습니다.',CURRENT:'현재 버전이 최신입니다.',AVAILABLE:'새 버전을 다운로드할 수 있습니다.',DOWNLOADING:'업데이트를 다운로드하고 있습니다.',READY:'업데이트가 준비됐습니다. 입력 중인 내용을 저장한 뒤 재시작하세요.',INSTALLING:'업데이트를 적용하기 위해 재시작합니다.',ERROR:'업데이트를 완료하지 못했습니다. 잠시 후 다시 확인하세요.'};
 let busy=false,polling=false,lastValue={status:'SETUP_REQUIRED'};
 function render(value){
  const state=Object.hasOwn(labels,value?.status)?value.status:'ERROR';lastValue=value;
  const version=typeof value?.version==='string'&&/^\d{1,4}\.\d{1,4}\.\d{1,4}$/.test(value.version)?` (v${value.version})`:'';
  document.getElementById('app-update-badge').textContent=({SETUP_REQUIRED:'배포 연결 대기',CURRENT:'최신 버전',READY:'적용 준비 완료',DOWNLOADING:'다운로드 중',ERROR:'다시 확인 필요'})[state]||'업데이트';
  document.getElementById('app-update-policy').textContent=state==='SETUP_REQUIRED'?'이 버전은 자동 배포 연결 전입니다. 서명된 배포가 연결되면 앱이 새 버전을 자동으로 확인하고 다운로드합니다.':'앱 시작 후와 6시간마다 새 버전을 확인합니다. 다운로드 후 재시작하여 적용하며, 처리 중인 작업이 있으면 적용을 기다립니다.';
  document.querySelector('.app-update-panel').dataset.state=state;
  status.textContent=value?.blocked&&state==='READY'?'처리 중인 작업이나 열린 창을 마친 뒤 다시 눌러주세요.':labels[state]+version;
  check.disabled=busy||!['IDLE','CURRENT','ERROR','AVAILABLE'].includes(state);download.hidden=state!=='AVAILABLE';restart.hidden=state!=='READY';ready.hidden=state!=='READY';
  download.disabled=busy;restart.disabled=busy;
  progress.hidden=state!=='DOWNLOADING';progress.value=Number.isFinite(value?.percent)?Math.max(0,Math.min(100,value.percent)):0;
 }
 async function run(method){if(busy)return;busy=true;render({...lastValue,...(method==='checkUpdate'?{status:'CHECKING'}:method==='downloadUpdate'?{status:'DOWNLOADING',percent:0}:{})});try{const value=await hub[method]();busy=false;render(value);}catch{busy=false;render({status:'ERROR'});}}
 check.addEventListener('click',()=>run('checkUpdate'));download.addEventListener('click',()=>run('downloadUpdate'));restart.addEventListener('click',()=>run('restartForUpdate'));
 ready.addEventListener('click',()=>{document.querySelector('[data-route="settings"]').click();document.querySelector('.app-update-panel').scrollIntoView({block:'center'});});
 void run('updateState');
 setInterval(async()=>{if(document.hidden||polling)return;polling=true;try{render(await hub.updateState());}catch{if(!busy)render({status:'ERROR'});}finally{polling=false;}},1500);
})();
