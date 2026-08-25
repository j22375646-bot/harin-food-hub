import Link from 'next/link';
import { HarinPictogram } from '../_design-system/harin-ui.js';
import styles from './product-readiness-flow.module.css';

const own = (source, key) => Object.prototype.hasOwnProperty.call(source || {}, key);
const value = (source, key) => own(source, key) && Number.isFinite(Number(source[key])) ? Number(source[key]) : null;
const label = number => number == null ? '판단 보류' : `${Math.max(0, number).toLocaleString('ko-KR')}개`;

export default function ProductReadinessFlow({ center = {} }) {
  const summary = center.summary || {};
  const total = value(summary, 'master_products');
  const connected = value(summary, 'all_channels_connected');
  const action = value(summary, 'action_required');
  const ready = total == null || action == null ? null : Math.max(0, total - action);
  const naver = value(summary, 'naver_real_products');
  const maximum = total && total > 0 ? total : null;
  const stages = [
    { icon: 'product', tone: 'amber', title: '판매 기준상품', metric: total, description: '현재 판매 중인 허브 기준상품' },
    { icon: 'link', tone: 'blue', title: '채널 연결 완료', metric: connected, description: 'Cafe24 · 네이버 · 쿠팡 연결' },
    { icon: 'warning', tone: 'pink', title: '확인 필요', metric: action, description: '가격·상태·연결 점검 대상' },
    { icon: 'checklist', tone: 'mint', title: '운영 준비 완료', metric: ready, description: '현재 추가 점검이 없는 상품' }
  ];

  return <section className={styles.flow} data-core-visualization="product-readiness-flow" aria-labelledby="product-readiness-title">
    <header className={styles.header}>
      <span><h2 id="product-readiness-title">상품 운영 준비도를 한눈에 봐요</h2><p>판매상품이 채널에 연결되고 실제 운영 준비를 마쳤는지 같은 기준으로 확인합니다.</p></span>
      <em>{naver == null ? '네이버 실상품 판단 보류' : `네이버 실상품 ${naver.toLocaleString('ko-KR')}개`}</em>
    </header>
    <ol className={styles.stages}>
      {stages.map((stage, index) => {
        const width = stage.metric == null || maximum == null ? 0 : Math.min(100, Math.round(stage.metric / maximum * 100));
        return <li data-tone={stage.tone} key={stage.title}>
          <span className={styles.index}>{index + 1}</span>
          <HarinPictogram icon={stage.icon} tone={stage.tone} size={19}/>
          <span className={styles.copy}><small>{stage.title}</small><strong>{label(stage.metric)}</strong><em>{stage.description}</em></span>
          <span className={styles.bar} aria-hidden="true"><i style={{ width: `${width}%` }}/></span>
        </li>;
      })}
    </ol>
    <footer className={styles.actions}>
      <Link href="/products/mappings"><HarinPictogram icon="link" tone="blue" size={17}/>상품 연결 확인</Link>
      <Link href="/products/costs"><HarinPictogram icon="price" tone="amber" size={17}/>원가 입력 확인</Link>
      <span>모르는 값은 0으로 바꾸지 않고 판단 보류로 남깁니다.</span>
    </footer>
  </section>;
}
