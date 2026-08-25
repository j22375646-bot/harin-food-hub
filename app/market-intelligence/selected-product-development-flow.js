import Link from 'next/link';
import { HarinPictogram } from '../_design-system/harin-ui.js';
import styles from './selected-product-development-flow.module.css';

const stages = [
  { threshold: 22, icon: 'database', tone: 'blue', title: '자료 준비', description: '파일·출처·상품 근거' },
  { threshold: 42, icon: 'analysis', tone: 'lavender', title: '시장 분석', description: '시장범위·수요 신호' },
  { threshold: 64, icon: 'target', tone: 'pink', title: '경쟁·전환 설계', description: '차별화·구매 장벽' },
  { threshold: 82, icon: 'experiments', tone: 'amber', title: 'A/B 실험', description: '가설·표본·성과 비교' },
  { threshold: 100, icon: 'checklist', tone: 'mint', title: '결과 학습', description: '7·14일 검증·다음 상품' }
];

const count = value => Math.max(0, Number(value) || 0).toLocaleString('ko-KR');

export default function SelectedProductDevelopmentFlow({ selected, onOpen, busy = false }) {
  if (!selected) return <section className={styles.empty} data-core-visualization="selected-product-development-flow"><HarinPictogram icon="growth" tone="lavender" size={24}/><span><b>현재 선택 상품이 없어요</b><p>판매 중 상품을 선택하면 그 상품의 개발 흐름만 표시합니다.</p></span></section>;
  const development = selected.development || {};
  const progress = Math.max(0, Math.min(100, Number(development.progress) || 0));
  const currentIndex = Math.max(0, stages.findIndex(stage => progress < stage.threshold));
  const projectId = selected.project?.id;
  const experimentHref = `/ab-tests?master_product_id=${encodeURIComponent(selected.id)}${projectId ? `&market_project_id=${encodeURIComponent(projectId)}` : ''}`;

  return <section className={styles.flow} data-core-visualization="selected-product-development-flow" aria-labelledby="selected-development-title">
    <header className={styles.header}>
      <span><small>현재 선택 상품</small><h2 id="selected-development-title">{selected.name}</h2><p>{selected.project ? `${selected.project.project_name} · 버전 ${selected.project.active_version}` : '아직 개발 프로젝트가 없어 첫 단계부터 시작합니다.'}</p></span>
      <aside><strong>{progress}%</strong><em>{development.label || '시작 전'}</em></aside>
    </header>
    <ol className={styles.stages}>
      {stages.map((stage, index) => {
        const state = progress >= stage.threshold ? 'complete' : index === currentIndex ? 'current' : 'waiting';
        return <li className={styles[state]} data-tone={stage.tone} key={stage.title}>
          <span className={styles.marker}>{progress >= stage.threshold ? '✓' : index + 1}</span>
          <HarinPictogram icon={stage.icon} tone={stage.tone} size={19}/>
          <span><b>{stage.title}</b><small>{stage.description}</small></span>
          <em>{state === 'complete' ? '완료' : state === 'current' ? '지금 할 단계' : '다음 단계'}</em>
        </li>;
      })}
    </ol>
    <div className={styles.facts}>
      <span><small>실행계획</small><b>{count(development.plans)}개</b></span>
      <span><small>A/B 실험</small><b>{count(development.experiments)}개</b></span>
      <span><small>결과 기록</small><b>{count(development.reports)}개</b></span>
    </div>
    <footer className={styles.actions}>
      <button type="button" onClick={onOpen} disabled={busy}>{busy ? '개발공간 여는 중…' : selected.project ? '이 상품 개발 이어가기' : '이 상품 개발 시작하기'}</button>
      <Link href={experimentHref}><HarinPictogram icon="experiments" tone="pink" size={17}/>이 상품 실험만 보기</Link>
    </footer>
  </section>;
}
