'use client';

import Link from 'next/link';
import keywordOperationsModule from '../../lib/marketing/keyword-operations.js';
import { HarinIcon } from '../_design-system/harin-icon.js';
import styles from './keyword-owner-shell.module.css';

const {keywordOwnerWorkspace}=keywordOperationsModule;
const won=value=>`${Math.round(Number(value||0)).toLocaleString('ko-KR')}원`;

export default function KeywordOwnerShell({platform='naver',workspace='registered',data={}}){
  const model=keywordOwnerWorkspace({
    platform,workspace,
    naverBidWorkbench:data.naverBidWorkbench,
    searchTermCenter:data.naver?.searchTermCenter,
    coupang:data.coupang,
    financialChanges:data.financialChanges
  });
  const isCoupang=model.platform==='coupang';
  const activityValue=isCoupang?model.summary.manual:model.summary.ready;
  const activityLabel=isCoupang?'WING 작업':'변경 가능';

  return <section className={`${styles.shell} ${isCoupang?styles.coupang:styles.naver}`} aria-labelledby="keyword-owner-title">
    <header className={styles.header}>
      <div className={styles.intro}>
        <span className={styles.owner}><HarinIcon name="keyword" size={18}/>{model.ownerLabel}</span>
        <h1 id="keyword-owner-title">{model.headline}</h1>
        <p>{model.separationNote}</p>
      </div>
      <aside className={styles.mode} aria-label={`${model.platformLabel} 운영 방식`}>
        <i><HarinIcon name={isCoupang?'checklist':'execution'} size={23}/></i>
        <span><small>{model.platformLabel} 운영 방식</small><b>{model.mode.label}</b><em>{model.mode.action}</em></span>
      </aside>
    </header>

    <nav className={styles.platforms} aria-label="키워드 플랫폼 선택">
      {model.platforms.map(item=><Link className={`${styles.platform} ${item.active?styles.active:''} ${item.id==='coupang'?styles.coupangCard:styles.naverCard}`} href={item.href} aria-current={item.active?'page':undefined} key={item.id}>
        <i>{item.id==='naver'?'N':'C'}</i>
        <span><b>{item.label}</b><small>{item.mode}</small></span>
        <em>{item.active?'운영 중':'열기'}<strong aria-hidden="true">→</strong></em>
      </Link>)}
    </nav>

    <div className={styles.body}>
      <nav className={styles.workspaces} aria-label={`${model.platformLabel} 키워드 작업공간`}>
        {model.workspaces.map(item=><Link className={item.active?styles.activeWorkspace:''} href={item.href} aria-current={item.active?'page':undefined} key={item.id}>
          <i className={styles[item.tone]}><HarinIcon name={item.icon} size={20}/></i>
          <span><b>{item.label}</b><small>{item.description}</small></span>
          <em aria-hidden="true">→</em>
        </Link>)}
      </nav>
      <aside className={styles.snapshot} aria-label={`${model.platformLabel} 현재 작업 요약`}>
        <span><small>현재 범위</small><b>{model.summary.total.toLocaleString('ko-KR')}개</b></span>
        <span><small>{activityLabel}</small><b>{activityValue.toLocaleString('ko-KR')}개</b></span>
        <span className={model.summary.noOrderCost>0?styles.risk:''}><small>무주문 광고비</small><b>{won(model.summary.noOrderCost)}</b></span>
        <p><HarinIcon name={isCoupang?'warning':'check'} size={17}/>{model.mode.description}</p>
      </aside>
    </div>
  </section>;
}
