(function(root){
'use strict';
const messages=Object.freeze({
 SUCCESS:{label:'완료',detail:'주문 수집이 완료됐습니다.',action:'목록에 자동 반영합니다.'},
 CS_PARTIAL:{label:'주문 완료 · 문의 일부 지연',detail:'주문은 저장됐지만 문의·취소 정보의 일부 조회가 완료되지 않았습니다.',action:'주문은 사용할 수 있습니다. 문의 정보는 다음 수집에서 다시 확인합니다.'},
 AUTH_REQUIRED:{label:'연결 인증 확인',detail:'플랫폼 인증을 거부했거나 연결 정보가 없습니다.',action:'앱 설정에서 해당 플랫폼 연결 상태를 확인해 주세요.'},
 AUTH_EXPIRED:{label:'연결 만료',detail:'플랫폼의 인증 갱신 정보가 만료됐습니다.',action:'앱 설정에서 해당 플랫폼을 다시 연결해 주세요.'},
 PERMISSION_DENIED:{label:'조회 권한 부족',detail:'플랫폼이 주문 조회 권한을 거부했습니다.',action:'플랫폼 앱의 주문 조회 권한과 연결 승인을 확인해 주세요.'},
 RATE_LIMITED:{label:'API 호출 제한',detail:'플랫폼의 호출 횟수 제한에 걸렸습니다.',action:'잠시 기다린 뒤 다시 수집해 주세요.'},
 TIMEOUT:{label:'수집 지연',detail:'제한 시간 안에 수집 응답을 받지 못했습니다.',action:'진행 확인으로 기존 요청 결과를 먼저 확인해 주세요.'},
 NETWORK_ERROR:{label:'연결 끊김',detail:'수집 서버와 플랫폼 사이의 네트워크 연결을 완료하지 못했습니다.',action:'잠시 후 다시 수집해 주세요.'},
 SERVER_CONFIG:{label:'서버 설정 확인',detail:'수집에 필요한 서버 설정을 읽지 못했습니다.',action:'관리자에게 이 오류 코드를 알려 주세요.'},
 DATABASE_ERROR:{label:'저장 서버 오류',detail:'주문 저장 서버에 연결하거나 수집 이력을 기록하지 못했습니다.',action:'이전 주문은 유지됩니다. 잠시 후 다시 확인해 주세요.'},
 API_ERROR:{label:'플랫폼 서버 오류',detail:'플랫폼 서버가 정상 응답하지 않았습니다.',action:'잠시 후 다시 수집해 주세요.'},
 INVALID_REQUEST:{label:'조회 조건 오류',detail:'플랫폼이 수집 요청 조건을 받아들이지 않았습니다.',action:'관리자에게 이 오류 코드를 알려 주세요.'},
 WORKER_OFFLINE:{label:'수집 서버 연결 확인',detail:'네이버·쿠팡 수집 서버의 연결을 확인하지 못했습니다.',action:'서버 연결 복구 후 진행 확인 또는 다시 수집을 눌러 주세요.'},
 REQUEST_FAILED:{label:'수집 실패',detail:'수집 실패가 확인됐지만 세부 오류가 전달되지 않았습니다.',action:'다시 수집해 주세요. 반복되면 관리자에게 코드를 알려 주세요.'},
 RESULT_MISSING:{label:'결과 확인 필요',detail:'수집 응답에 완료 여부를 판단할 정보가 없습니다.',action:'중복 요청을 피하기 위해 기존 결과를 먼저 확인해 주세요.'},
 RESPONSE_INVALID:{label:'응답 형식 오류',detail:'수집 서버의 응답 형식을 확인하지 못했습니다.',action:'기존 주문을 유지합니다. 잠시 후 진행을 다시 확인해 주세요.'},
 SESSION_REQUIRED:{label:'모아온 로그인 필요',detail:'모아온의 로그인 상태를 확인해 주세요.',action:'다시 로그인한 후 수집해 주세요.'},
 NOT_CHECKED:{label:'확인 필요',detail:'아직 이번 수집의 결과를 확인하지 않았습니다.',action:'자동 수집 또는 지금 수집으로 확인할 수 있습니다.'},
 QUEUED:{label:'수집 대기',detail:'요청이 접수되어 수집 서버의 처리를 기다리고 있습니다.',action:'자동으로 진행을 확인합니다.'},
 RUNNING:{label:'수집 중',detail:'수집 서버가 주문을 조회하고 있습니다.',action:'자동으로 진행을 확인합니다.'},
 DELAYED:{label:'수집 지연',detail:'수집 서버의 처리가 평소보다 오래 걸리고 있습니다.',action:'진행 확인으로 기존 요청을 확인해 주세요. 새 요청을 중복 실행하지 않습니다.'}
});
const valid=code=>typeof code==='string'&&Object.hasOwn(messages,code);
function httpStatus(error){const n=Number(error?.status||error?.statusCode||error?.cause?.status||String(error?.message||'').match(/\((\d{3})\)/)?.[1]);return n>=400&&n<=599?n:null;}
function classify(error){
 const message=String(error?.message||''),code=String(error?.code||''),status=httpStatus(error);
 if(/PGRST|^08|^53|^57|^58/.test(code)||/sync_logs:|schema cache|statement timeout|SUPABASE_/.test(message))return 'DATABASE_ERROR';
 if(/Missing required server environment|credential.*(?:missing|unavailable)|KEY_ADMISSION|DECRYPT|invalid_client/i.test(message+' '+code))return 'SERVER_CONFIG';
 if(/invalid_grant|token.*expired/i.test(message))return 'AUTH_EXPIRED';
 if(status===401||/not connected|refresh token|reconnect oauth/i.test(message))return 'AUTH_REQUIRED';
 if(status===403||/invalid_scope|insufficient_scope/i.test(message))return 'PERMISSION_DENIED';if(status===429)return 'RATE_LIMITED';
 if(status===408||status===504||/timeout|timed out|aborted/i.test(message+' '+code)||['AbortError','TimeoutError'].includes(error?.name))return 'TIMEOUT';
 if(status>=500)return 'API_ERROR';if(status===400||status===422)return 'INVALID_REQUEST';
 if(/network|fetch failed|ENOTFOUND|ECONN|EAI_AGAIN/i.test(message+' '+code))return 'NETWORK_ERROR';return 'REQUEST_FAILED';
}
function failure(error,now=new Date().toISOString()){return {status:'FAILED',code:classify(error),httpStatus:httpStatus(error),observedAt:now};}
function worker(row,ready=true,error=null,now=new Date().toISOString()){
 if(!row)return ready?failure(error||{},now):{status:'FAILED',code:'WORKER_OFFLINE',observedAt:now};
 const status=['SUCCESS','FAILED','PENDING','RUNNING'].includes(row.status)?row.status:'CHECK_REQUIRED';
 const observedAt=row.finished_at||row.executed_at||row.started_at||row.requested_at||row.created_at||now;
 const age=Date.parse(now)-Date.parse(row.started_at||row.requested_at||row.created_at||now);
 const code=status==='SUCCESS'?'SUCCESS':status==='FAILED'?classify({message:row.error_message}):!ready?'WORKER_OFFLINE':age>120000?'DELAYED':status==='RUNNING'?'RUNNING':status==='PENDING'?'QUEUED':'RESULT_MISSING';
 return {status,code,observedAt};
}
const api=Object.freeze({messages,valid,httpStatus,classify,failure,worker,describe:code=>messages[valid(code)?code:'RESULT_MISSING']});
if(typeof module==='object'&&module.exports)module.exports=api;else root.moaonCollectionDiagnostics=api;
})(globalThis);
