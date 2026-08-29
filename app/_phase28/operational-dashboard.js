'use client';

import {useState} from 'react';
import HarinIcon from '../_design-system/harin-icon.js';
import './phase28-operational.css';

const brandCopy={
  NAVER:{label:'네이버',mark:'N'},
  CAFE24:{label:'Cafe24',mark:'24'},
  COUPANG:{label:'쿠팡',mark:'C'}
};

export function formatPhase28AsOf(value){
  if(!value)return '기준시각 확인 필요';
  const date=new Date(value);
  if(Number.isNaN(date.getTime()))return '기준시각 확인 필요';
  return new Intl.DateTimeFormat('ko-KR',{
    timeZone:'Asia/Seoul',month:'long',day:'numeric',weekday:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23'
  }).format(date);
}

export function Phase28ChannelLogo({platform,size='standard'}){
  const id=String(platform||'').toUpperCase();
  const brand=brandCopy[id]||{label:id||'채널',mark:'·'};
  return <span className={`phase28ChannelLogo phase28ChannelLogo--${size}`} data-brand={id.toLowerCase()} role="img" aria-label={brand.label}>{brand.mark}</span>;
}

export function Phase28ChannelRows({channels=[]}){
  if(!channels.length)return <p className="phase28OperationalEmpty">연결된 채널 상태를 확인하고 있어요.</p>;
  return <div className="phase28OperationalChannelRows">{channels.map((item,index)=>{
    const platform=String(item.platform||'').toUpperCase();
    const ready=['READY','RUNNING'].includes(String(item.status||'').toUpperCase());
    const label=item.statusLabel||item.label||({READY:'정상',RUNNING:'수집 중',SETUP_REQUIRED:'설정 필요',FAILED:'수집 실패'}[item.status])||'확인 필요';
    return <article key={`${platform}-${index}`}>
      <Phase28ChannelLogo platform={platform}/>
      <span><strong>{brandCopy[platform]?.label||platform}</strong><small>{item.message||'최근 수집 상태 확인'}</small></span>
      <em className={ready?'ready':'check'}><i/>{label}</em>
    </article>;
  })}</div>;
}

function OperationalPulse({label,items=[]}){
  return <section className="phase28OperationalPulse" aria-label={label}>
    <header><div><h2>{label}</h2><p>현재 작업 단계와 확인 상태를 한 줄로 이어서 봅니다.</p></div><span>실제 운영 자료</span></header>
    <div className="phase28OperationalPulseTrack" role="list">{items.map((item,index)=><article role="listitem" className={`phase28OperationalPulseItem ${item.tone||'calm'}`} key={item.id||index}>
      <span><HarinIcon name={item.icon||'check'} size={19}/></span>
      <div><small>{item.kicker||`${index+1}단계`}</small><strong>{item.label}</strong></div>
      <em>{item.value}</em>
    </article>)}</div>
  </section>;
}

export default function Phase28OperationalDashboard({
  kind,
  context,
  titleBefore,
  titleAccent,
  titleAfter,
  summary,
  asOf,
  heroFact,
  pulseLabel,
  pulseItems,
  tabs,
  railLabel,
  children
}){
  const [railOpen,setRailOpen]=useState(true);
  const [activeTab,setActiveTab]=useState(tabs[0]?.id||'overview');

  return <section className={`phase28Operational phase28Operational--${kind}`} data-phase28-page={kind} data-rail-open={railOpen?'true':'false'}>
    <header className="phase28OperationalHero">
      <div>
        <span className="phase28OperationalContext"><i/>{context} · {formatPhase28AsOf(asOf)}</span>
        <h1>{titleBefore}<em className="page-title-accent">{titleAccent}</em>{titleAfter}</h1>
        <p>{summary}</p>
      </div>
      <aside className={heroFact.tone||'calm'}><span>{heroFact.label}</span><strong>{heroFact.value}</strong><small>{heroFact.description}</small></aside>
    </header>

    <OperationalPulse label={pulseLabel} items={pulseItems}/>

    <div className="phase28OperationalLayout">
      <div className="phase28OperationalBody">{children}</div>
      <aside className="phase28OperationalRail" aria-label={railLabel}>
        <button type="button" className="phase28OperationalRailControl" aria-expanded={railOpen} aria-controls={`phase28-${kind}-rail-content`} onClick={()=>setRailOpen(value=>!value)}>
          <HarinIcon name={railOpen?'chevron':'sidebarExpand'} size={18}/>
          <span>{railOpen?`${railLabel} 접기`:`${railLabel} 열기`}</span>
        </button>
        <div className="phase28OperationalRailContent" id={`phase28-${kind}-rail-content`} aria-hidden={!railOpen}>
          <div className="phase28OperationalRailTabs" role="tablist" aria-label={`${railLabel} 보기`}>
            {tabs.map(tab=><button type="button" role="tab" id={`phase28-${kind}-tab-${tab.id}`} aria-controls={`phase28-${kind}-panel-${tab.id}`} aria-selected={activeTab===tab.id} tabIndex={activeTab===tab.id?0:-1} onClick={()=>setActiveTab(tab.id)} key={tab.id}>{tab.label}</button>)}
          </div>
          <div className="phase28OperationalPanelStack">
            {tabs.map(tab=>{
              const active=activeTab===tab.id;
              return <section className={`phase28OperationalPanel${active?' active':''}`} role="tabpanel" id={`phase28-${kind}-panel-${tab.id}`} aria-labelledby={`phase28-${kind}-tab-${tab.id}`} aria-hidden={!active} inert={active?undefined:''} key={tab.id}>{tab.content}</section>;
            })}
          </div>
        </div>
      </aside>
    </div>
  </section>;
}
