'use client';

import {useState} from 'react';
import HarinIcon from './_design-system/harin-icon.js';

const LABELS={AWS_SYSTEMD:'AWS systemd',VERCEL_CRON:'Vercel Cron',SUPABASE_CRON:'Supabase Cron',SUPABASE_TABLE:'Supabase 테이블',MANUAL:'사장님 수동',VERCEL_FUNCTION:'Vercel 함수',AWS_FIXED_IP_WORKER:'AWS 고정 IP 워커',SUPABASE_DATABASE:'Supabase DB',OWNER:'사장님',SUPABASE_CUSTOM_TABLE:'사용자 정의 큐',NONE:'직접 실행'};
const STATES={ACTIVE:['운영 신호 확인','ready'],OBSERVE:['관찰 중','observe'],CHECK:['신호 확인 필요','check'],COLLISION_RISK:['중복 위험','danger'],BLOCKED:['전환 차단','danger']};
const KST=new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',month:'numeric',day:'numeric',hour:'numeric',minute:'2-digit'});
function date(value){return value?KST.format(new Date(value)):'아직 없음';}
function State({value}){const [label,tone]=STATES[value]||['확인 필요','check'];return <span className={`executionPathState ${tone}`}><i/>{label}</span>;}
function FlowStep({icon,label,value}){return <span className="executionFlowStep"><i><HarinIcon name={icon} size={20}/></i><small>{label}</small><b>{LABELS[value]||value}</b></span>;}
function Lane({lane}){return <article className={`executionLane ${String(lane.state||'').toLowerCase()}`}><header><span className="executionLaneIcon"><HarinIcon name={lane.current_executor==='AWS_FIXED_IP_WORKER'?'server':lane.current_trigger.includes('CRON')?'clock':'collection'} size={23}/></span><div><small>{lane.lane_key}</small><h2>{lane.label}</h2><p>{lane.schedule_label}</p></div><State value={lane.state}/></header><div className="executionFlow"><FlowStep icon="clock" label="시작" value={lane.current_trigger}/><HarinIcon name="chevron" size={18}/><FlowStep icon="database" label="대기·전달" value={lane.queue_backend}/><HarinIcon name="chevron" size={18}/><FlowStep icon="server" label="실행" value={lane.current_executor}/></div><div className={`executionAutoGuard ${String(lane.protectionState||'').toLowerCase()}`}><HarinIcon name={lane.protectionState==='PROTECTED'?'check':'warning'} size={18}/><span><b>{lane.protectionState==='PROTECTED'?'단일 실행 경로 확인':'자동 확인 필요'}</b><small>{lane.ownerKey}</small></span></div><footer><span><small>실제 경로</small><b>{lane.source_path}</b></span><span><small>최근 근거</small><b>{lane.evidenceLabel}</b><em>{date(lane.lastEvidenceAt)}</em></span></footer></article>;}

export default function ExecutionPathCenter({center:initialCenter={}}){
  const [center,setCenter]=useState(initialCenter);
  const [checking,setChecking]=useState(false);
  const [message,setMessage]=useState('');
  const summary=center.summary||{},worker=center.worker||{};
  async function checkNow(){
    if(checking)return;
    setChecking(true);setMessage('현재 실행 경로를 다시 확인하고 있어요…');
    try{
      const response=await fetch('/api/infrastructure/execution-paths/check',{method:'POST'});
      const result=await response.json();
      if(!response.ok||!result.ok)throw new Error(result.error||'확인 실패');
      setCenter(result.center);
      const next=result.center.summary||{};
      setMessage(next.collisionKeys?`중복 위험 ${next.collisionKeys}건을 발견했어요.`:next.activeQueue?`중복은 없어요 · 진행 중인 작업 ${next.activeQueue}건이 끝난 뒤 전환할 수 있어요.`:`중복 실행 없음 · ${next.protectedLanes||0}개 경로가 안전해요.`);
    }catch(error){setMessage(`확인 필요 · ${error.message}`);}finally{setChecking(false);}
  }
  return <section className="executionPathCenter"><header className="executionPathHero"><div className="executionPathHeroIcon"><HarinIcon name="server" size={31}/></div><div><span>PHASE {center.phase||'21-2'} · SINGLE ACTIVE PATH</span><h1>작업 실행 경로·전환센터</h1><p>systemd·Cron·큐가 같은 작업을 두 번 실행하지 않도록, 지금 실제 운영 경로부터 고정해 보여드려요.</p></div><aside><b>자동 보호</b><small>별도 절차 없음</small></aside></header><section className="executionPathGuard"><HarinIcon name="shield" size={23}/><span><b>혼자 쓰는 허브답게 한 번만 누르면 돼요</b><small>추가 확인 단계 없이 중복 실행·동시 작업·워커 상태를 자동 검사합니다. 실제 경로는 아직 바꾸지 않아요.</small></span><button type="button" onClick={checkNow} disabled={checking}><HarinIcon name="sync" size={19}/>{checking?'확인 중…':'지금 중복 확인'}</button></section>{message?<p className={`executionCheckMessage ${summary.collisionKeys?'danger':'ready'}`} role="status">{message}</p>:null}<section className="executionPathKpis"><article><HarinIcon name="link" size={22}/><span><small>자동 보호 경로</small><b>{summary.protectedLanes||0}/{summary.lanes||0}개</b></span></article><article><HarinIcon name="checklist" size={22}/><span><small>운영 신호 확인</small><b>{summary.activeLanes||0}개</b></span></article><article className={summary.collisionKeys?'danger':''}><HarinIcon name="warning" size={22}/><span><small>활성 멱등키 충돌</small><b>{summary.collisionKeys||0}건</b></span></article><article><HarinIcon name="server" size={22}/><span><small>고정 IP 워커</small><b>{worker.ready?'정상':'확인 필요'}</b><em>{worker.lastSeenAt?`${worker.ageMinutes}분 전 · ${worker.sourceIp||'IP 확인'}`:'신호 없음'}</em></span></article></section><section className="executionQueueTruth"><span><HarinIcon name="database" size={22}/><b>현재 큐</b><small>Supabase 사용자 정의 테이블 · 활성 {summary.activeQueue||0}건</small></span><span className={summary.nativeQueueEnabled?'ready':'muted'}><HarinIcon name="collection" size={22}/><b>Supabase 네이티브 Queue</b><small>{summary.nativeQueueEnabled?'사용 확인됨':'현재 미사용 · 전환 검토 전'}</small></span></section><div className="executionLaneGrid">{(center.lanes||[]).map(lane=><Lane lane={lane} key={lane.lane_key}/>)}</div>{center.collisions?.length?<section className="executionCollision" role="alert"><HarinIcon name="warning" size={24}/><div><b>중복 실행 위험을 발견했어요</b>{center.collisions.map(item=><p key={`${item.source}:${item.key}`}>{item.source} · {item.key} · 활성 {item.count}건</p>)}</div></section>:null}<details className="naverApiHelp executionPathHelp"><summary><span><HarinIcon name="shield" size={20}/><b>자동 보호 기준</b></span><em>열기</em></summary><ol>{(center.protections||[]).map(rule=><li key={rule}>{rule}</li>)}</ol><p>과거 멱등키 없는 기록 {summary.legacyWithoutKey||0}건은 현재 활성 작업으로 세지 않고 참고 이력으로만 남깁니다.</p></details></section>;
}
