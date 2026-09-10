'use strict';
(()=>{
 const hub=window.moaonHub,status=document.getElementById('app-update-status'),progress=document.getElementById('app-update-progress');
 const check=document.getElementById('app-update-check'),download=document.getElementById('app-update-download'),restart=document.getElementById('app-update-restart'),ready=document.getElementById('update-ready-open');
 const labels={SETUP_REQUIRED:'자동 업데이트 배포 준비 중입니다.',IDLE:'새 버전을 확인할 수 있습니다.',CHECKING:'새 버전을 확인하고 있습니다.',CURRENT:'현재 버전이 최신입니다.',AVAILABLE:'새 버전을 다운로드할 수 있습니다.',DOWNLOADING:'업데이트를 다운로드하고 있습니다.',READY:'업데이트가 준비됐습니다. 입력 중인 내용을 저장한 뒤 재시작하세요.',INSTALLING:'업데이트를 적용하기 위해 재시작합니다.',ERROR:'업데이트를 완료하지 못했습니다. 잠시 후 다시 확인하세요.'};
 const dialog=document.getElementById('app-update-dialog'),accept=document.getElementById('app-update-accept'),later=document.getElementById('app-update-later');
 let busy=false,polling=false,lastValue={status:'SETUP_REQUIRED'},dismissed=new Set();
 function dismiss(){dismissed.add(lastValue.version);dialog.close();}
 function showPrompt(force=false){if(!['AVAILABLE','DOWNLOADING','READY','ERROR'].includes(lastValue.status))return;if(!force&&(dismissed.has(lastValue.version)||!['AVAILABLE','READY'].includes(lastValue.status)||document.querySelector('dialog[open]')||!document.getElementById('entry-screen').hidden||document.hidden))return;if(!dialog.open)dialog.showModal();}
 later.onclick=dismiss;dialog.addEventListener('cancel',()=>dismissed.add(lastValue.version));
 accept.onclick=()=>{if(lastValue.status==='AVAILABLE')void run('downloadUpdate');else if(lastValue.status==='READY'){dialog.close();void run('restartForUpdate');}else if(lastValue.status==='ERROR')void run('checkUpdate');};
 function render(value){
  const state=Object.hasOwn(labels,value?.status)?value.status:'ERROR';lastValue=value;
  const version=typeof value?.version==='string'&&/^\d{1,4}\.\d{1,4}\.\d{1,4}$/.test(value.version)?` (v${value.version})`:'';
  document.getElementById('app-update-badge').textContent=({SETUP_REQUIRED:'배포 연결 대기',CURRENT:'최신 버전',READY:'적용 준비 완료',DOWNLOADING:'다운로드 중',ERROR:'다시 확인 필요'})[state]||'업데이트';
  document.getElementById('app-update-policy').textContent=state==='SETUP_REQUIRED'?'이 버전은 자동 배포 연결 전입니다. 서명된 배포가 연결되면 새 버전을 알리고, 동의한 경우 다운로드합니다.':'앱 시작 후와 6시간마다 새 버전을 확인합니다. 동의한 경우 다운로드하고 재시작하여 적용하며, 처리 중인 작업이 있으면 적용을 기다립니다.';
  document.querySelector('.app-update-panel').dataset.state=state;
  status.textContent=value?.blocked&&state==='READY'?'처리 중인 작업이나 열린 창을 마친 뒤 다시 눌러주세요.':labels[state]+version;
  check.disabled=busy||!['IDLE','CURRENT','ERROR','AVAILABLE'].includes(state);download.hidden=state!=='AVAILABLE';restart.hidden=state!=='READY';ready.hidden=!['AVAILABLE','DOWNLOADING','READY'].includes(state);ready.textContent=state==='READY'?'업데이트 적용':state==='DOWNLOADING'?'업데이트 다운로드 중':'새 버전 있음';
  download.disabled=busy;restart.disabled=busy;
  progress.hidden=state!=='DOWNLOADING';progress.value=Number.isFinite(value?.percent)?Math.max(0,Math.min(100,value.percent)):0;
  document.getElementById('app-update-dialog-title').textContent=state==='READY'?'업데이트 준비가 완료됐습니다':state==='DOWNLOADING'?'새 버전을 다운로드하고 있습니다':state==='ERROR'?'업데이트를 다시 확인해 주세요':'새 버전이 있습니다';
  document.getElementById('app-update-dialog-version').textContent=version?version.trim():'';
  document.getElementById('app-update-dialog-message').textContent=value?.blocked?'처리 중인 작업이나 열린 창을 마친 뒤 다시 적용해 주세요.':state==='READY'?'입력 중인 내용을 저장해 주세요. 재시작하면 새 버전을 적용합니다.':state==='DOWNLOADING'?'다운로드 중에도 작업을 계속할 수 있습니다. 자동으로 재시작하지 않습니다.':state==='ERROR'?'연결 상태를 확인한 뒤 다시 시도하세요. 현재 버전은 계속 사용할 수 있습니다.':'새로운 버전으로 업데이트하시겠습니까? 다운로드는 동의 후 시작하며, 적용 전 재시작을 따로 확인합니다.';
  accept.textContent=state==='READY'?'저장 완료 · 재시작':state==='DOWNLOADING'?'다운로드 중':state==='ERROR'?'다시 확인':'업데이트 다운로드';accept.disabled=busy||!['AVAILABLE','READY','ERROR'].includes(state);
  const modalProgress=document.getElementById('app-update-dialog-progress');modalProgress.hidden=state!=='DOWNLOADING';modalProgress.value=progress.value;later.textContent=state==='DOWNLOADING'?'작업 계속하기':'나중에';
  if(!['AVAILABLE','DOWNLOADING','READY','ERROR'].includes(state)&&dialog.open)dialog.close();showPrompt();
 }
 async function run(method){if(busy)return;busy=true;render({...lastValue,...(method==='checkUpdate'?{status:'CHECKING'}:method==='downloadUpdate'?{status:'DOWNLOADING',percent:0}:{})});try{const value=await hub[method]();busy=false;render(value);}catch{busy=false;render({status:'ERROR'});}}
 check.addEventListener('click',()=>run('checkUpdate'));download.addEventListener('click',()=>run('downloadUpdate'));restart.addEventListener('click',()=>run('restartForUpdate'));
 ready.addEventListener('click',()=>showPrompt(true));
 void run('updateState');
 setInterval(async()=>{if(document.hidden||polling)return;polling=true;try{render(await hub.updateState());}catch{if(!busy)render({status:'ERROR'});}finally{polling=false;}},1500);
})();
