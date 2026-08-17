'use client';

import {useState} from 'react';
import HarinIcon from './_design-system/harin-icon.js';

const STATUS={
  READY:['정상 읽기','ready'],STALE:['자료 갱신 필요','partial'],RUNNING:['확인 중','running'],FAILED:['읽기 실패','failed'],
  VERIFY_REQUIRED:['읽기 확인 필요','verify'],SETUP_REQUIRED:['설정 필요','setup'],IMPORT_REQUIRED:['파일 가져오기 필요','setup'],
  LOCKED:['변경 잠금','locked'],OWNER_APPROVAL:['승인 후 변경','approval'],READ_REFRESH_REQUIRED:['재조회 후 변경','verify'],
  MANUAL_REQUIRED:['WING 수동 반영','partial']
};
const DATE_TIME=new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',month:'numeric',day:'numeric',hour:'numeric',minute:'2-digit'});
const wait=milliseconds=>new Promise(resolve=>setTimeout(resolve,milliseconds));

function Status({value}){
  const [label,tone]=STATUS[value]||[value||'확인 필요','muted'];
  return <span className={`naverApiStatus ${tone}`}><i aria-hidden="true"/>{label}</span>;
}
function DateValue({value}){
  return value?<time dateTime={value}>{DATE_TIME.format(new Date(value))}</time>:<span>기록 없음</span>;
}
function Count({label,value}){
  return <span><small>{label}</small><b>{Number(value||0).toLocaleString('ko-KR')}</b></span>;
}
function ChannelCard({channel,working,onProbe}){
  const naver=channel.platform==='NAVER';
  const counts=naver
    ? [['캠페인',channel.counts.campaigns],['광고그룹',channel.counts.adgroups],['키워드',channel.counts.keywords],['성과 일수',channel.counts.performance_days]]
    : [['성과 일수',channel.counts.performance_days],['캠페인',channel.counts.campaigns],['표시 키워드',channel.counts.visible_keywords],['과금 일수',channel.counts.billing_days]];
  return <article className={`advertisingChannelCard ${channel.tone}`}>
    <header>
      <span className="advertisingChannelIcon"><HarinIcon name={channel.icon} size={28}/></span>
      <div><small>{channel.sourceMode}</small><h2>{channel.label}</h2><p>{channel.sourceLabel}</p></div>
      <Status value={channel.readStatus}/>
    </header>
    <div className="advertisingChannelSummary"><strong>{channel.summary}</strong><span><Status value={channel.writeStatus}/></span></div>
    <section className="advertisingChannelCounts" aria-label={`${channel.label} 자료 수`}>{counts.map(([label,value])=><Count key={label} label={label} value={value}/>)}</section>
    <dl className="naverApiDates"><div><dt>마지막 성공 자료</dt><dd><DateValue value={channel.lastSuccessAt}/></dd></div><div><dt>마지막 확인</dt><dd><DateValue value={channel.lastAttemptAt}/></dd></div></dl>
    {channel.officialScope?<p className="advertisingOfficialScope"><HarinIcon name="shield" size={17}/><span>{channel.officialScope}</span></p>:null}
    <details className="naverApiCapabilities"><summary><span><HarinIcon name="checklist" size={19}/><b>변경 안전장치</b></span><em>열기</em></summary><div className="advertisingSafeguards">{channel.safeguards.map(item=><p key={item}><HarinIcon name="shield" size={16}/><span>{item}</span></p>)}</div></details>
    <div className="advertisingChannelActions">
      {channel.primaryAction.kind==='probe'?<button type="button" className="naverApiProbeButton" disabled={Boolean(working)} onClick={()=>onProbe(channel)}><HarinIcon name={working?'sync':'shield'} size={19}/>{working?'읽기 확인 중…':channel.primaryAction.label}</button>:<a className="naverApiProbeButton" href={channel.primaryAction.href}><HarinIcon name="document" size={19}/>{channel.primaryAction.label}</a>}
      <a href={channel.workAction.href}><HarinIcon name="target" size={18}/>{channel.workAction.label}</a>
    </div>
  </article>;
}

export default function AdvertisingChannelCenter({center={}}){
  const [working,setWorking]=useState('');
  const [message,setMessage]=useState('');
  async function probe(channel){
    setWorking(channel.platform);setMessage(`${channel.label} 읽기 권한을 다시 확인하고 있어요.`);
    try{
      const response=await fetch(channel.primaryAction.endpoint,{method:'POST',headers:{Accept:'application/json'}});
      const result=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(result.error||'읽기 확인 요청이 실패했습니다.');
      setMessage(`${channel.label} 읽기 확인이 끝났어요. 최신 상태로 바꿀게요.`);
      await wait(700);window.location.reload();
    }catch(error){setMessage(`확인 필요 · ${error.message}`);setWorking('');}
  }
  return <section className="naverApiCenter advertisingChannelCenter">
    <header className="naverApiHero advertisingChannelHero">
      <div className="naverApiHeroIcon"><HarinIcon name="target" size={30}/></div>
      <div><span>PHASE {center.phase||'19-7'} · OPERATED CHANNELS ONLY</span><h1>광고 API 운영센터</h1><p>네이버와 쿠팡을 섞지 않고, 실제 운영 중인 광고 채널의 읽기·변경 가능 범위를 각각 보여드려요.</p></div>
      <aside><span><b>{center.summary?.operated||0}</b>개 운영</span><span><b>{center.summary?.ready||0}</b>개 최신</span></aside>
    </header>
    {message?<div className="naverApiToast" role="status" aria-live="polite"><HarinIcon name={working?'sync':'note'} size={20}/><span>{message}</span></div>:null}
    <section className="naverApiRules"><HarinIcon name="shield" size={23}/><div><b>채널별 데이터와 변경 경로를 완전히 분리했어요</b><p>네이버 읽기가 최신이어야 승인형 입찰 변경을 시작할 수 있고, 쿠팡은 WING에서 직접 반영한 뒤 파일을 다시 가져와 검증합니다.</p></div></section>
    {center.channels?.length?<div className="advertisingChannelGrid">{center.channels.map(channel=><ChannelCard key={channel.platform} channel={channel} working={working===channel.platform} onProbe={probe}/>)}</div>:<div className="advertisingEmpty"><HarinIcon name="target" size={30}/><b>운영 중인 광고 채널 자료가 아직 없어요</b><p>네이버 읽기 연결 또는 쿠팡 광고보고서 가져오기를 완료하면 해당 채널만 나타납니다.</p></div>}
    {center.excluded?.length?<details className="naverApiHelp"><summary><span><HarinIcon name="filter" size={20}/><b>화면에서 제외한 채널 {center.excluded.length}개</b></span><em>열기</em></summary><ol>{center.excluded.map(item=><li key={item.platform}><b>{item.label}</b> · {item.reason}</li>)}</ol></details>:null}
    <details className="naverApiHelp"><summary><span><HarinIcon name="note" size={20}/><b>이 화면의 운영 원칙</b></span><em>열기</em></summary><ol>{(center.rules||[]).map(rule=><li key={rule}>{rule}</li>)}</ol></details>
  </section>;
}
