import styles from './primitives.module.css';

const LOGOS={
  NAVER:{mark:'N',label:'네이버'},
  CAFE24:{mark:'24',label:'Cafe24'},
  COUPANG:{mark:'C',label:'쿠팡'},
  COUPANG_RG:{mark:'RG',label:'쿠팡 로켓그로스'}
};

export function Phase28ChannelLogo({brand,size='standard'}) {
  const normalized=String(brand||'').toUpperCase();
  const logo=LOGOS[normalized]||{mark:'·',label:'채널 확인 필요'};
  const sizeClass=size==='compact'?styles.compact:'';
  return <span className={`${styles.channelLogo} ${sizeClass}`} data-brand={normalized.toLowerCase()} data-logo-size={size} role="img" aria-label={logo.label}>{logo.mark}</span>;
}
