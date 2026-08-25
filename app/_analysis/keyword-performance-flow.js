import {HarinIcon} from '../_design-system/harin-icon.js';
import styles from './keyword-performance-flow.module.css';

const number=value=>{
  if(value===null||value===undefined||value==='')return null;
  const parsed=Number(value);
  return Number.isFinite(parsed)?parsed:null;
};

const won=value=>value==null?'판단 보류':`${Math.round(value).toLocaleString('ko-KR')}원`;
const count=value=>value==null?'판단 보류':`${Math.round(value).toLocaleString('ko-KR')}건`;
const percent=value=>value==null?'판단 보류':`${value.toFixed(1)}%`;

function confirmedSum(rows,key){
  const values=rows.map(row=>number(row[key])).filter(value=>value!==null);
  return values.length?values.reduce((sum,value)=>sum+value,0):null;
}
function ratio(numerator,denominator,multiplier=100){
  return numerator!=null&&denominator!=null&&denominator>0?numerator/denominator*multiplier:null;
}

function bidDirection(row){
  const current=number(row.currentBid);
  const recommended=number(row.recommendedBid);
  if(current!==null&&recommended!==null){
    if(recommended>current)return 'raise';
    if(recommended<current)return 'lower';
    return 'hold';
  }
  if(['RAISE','NEW_KEYWORD'].includes(row.decision))return 'raise';
  if(['LOWER','NEGATIVE_REVIEW'].includes(row.decision))return 'lower';
  if(['KEEP','WATCH','OBSERVE'].includes(row.decision))return 'hold';
  return 'blocked';
}

function summarize(rows){
  const operational=rows.filter(row=>row.adCategoryState!=='INACTIVE');
  const cost=confirmedSum(operational,'cost');
  const impressions=confirmedSum(operational,'impressions');
  const clicks=confirmedSum(operational,'clicks');
  const orders=confirmedSum(operational,'orders');
  const revenue=confirmedSum(operational,'revenue');
  const noOrderEvidence=operational.filter(row=>number(row.cost)!==null&&number(row.orders)!==null);
  const noOrderSpend=noOrderEvidence.length?noOrderEvidence.reduce((sum,row)=>sum+(number(row.orders)===0?number(row.cost):0),0):null;
  const actions={raise:0,lower:0,hold:0,blocked:0};
  for(const row of operational)actions[bidDirection(row)]+=1;
  return {operational,cost,impressions,clicks,orders,revenue,noOrderSpend,actions};
}

const FLOW_COPY=[
  ['cost','광고비','price'],
  ['clicks','클릭','search'],
  ['orders','주문','orders'],
  ['revenue','매출','growth']
];

export default function KeywordPerformanceFlow({platform='naver',rows=[]}){
  const summary=summarize(rows);
  const isCoupang=platform==='coupang';
  const actionTotal=Object.values(summary.actions).reduce((sum,value)=>sum+value,0);
  const metrics={
    cost:{value:won(summary.cost),hint:summary.impressions==null?'노출 자료 확인 필요':`노출 ${Math.round(summary.impressions).toLocaleString('ko-KR')}회`},
    clicks:{value:count(summary.clicks),hint:`클릭률 ${percent(ratio(summary.clicks,summary.impressions))}`},
    orders:{value:count(summary.orders),hint:`주문전환율 ${percent(ratio(summary.orders,summary.clicks))}`},
    revenue:{value:won(summary.revenue),hint:`ROAS ${percent(ratio(summary.revenue,summary.cost))}`}
  };
  const actionCopy=[
    ['lower','입찰 낮추기','감액·절감 후보'],
    ['raise','입찰 높이기','확대 후보'],
    ['hold','유지·관찰','현재값 유지'],
    ['blocked','판단 보류','근거·설정 확인']
  ];
  return <section className={`${styles.workbench} ${isCoupang?styles.coupang:styles.naver}`} data-core-visualization="keyword-performance-flow" data-platform={platform} aria-label="선택 범위 키워드 성과 흐름">
    <header className={styles.header}>
      <span className={styles.heading}><i><HarinIcon name="growth" size={22}/></i><span><b>광고비가 주문으로 이어지는 흐름</b><small>현재 선택 범위의 확인된 자료만 연결해요.</small></span></span>
      <span className={styles.mode}><i aria-hidden="true"/><span><small>적용 방식</small><b>{isCoupang?'쿠팡 WING 수동 적용':'네이버 API 직접 변경'}</b></span></span>
    </header>
    <div className={styles.flow} role="img" aria-label={`광고비 ${metrics.cost.value}, 클릭 ${metrics.clicks.value}, 주문 ${metrics.orders.value}, 매출 ${metrics.revenue.value}`}>
      {FLOW_COPY.map(([key,label,icon],index)=><div className={styles.flowGroup} key={key}>
        <article className={`${styles.stage} ${styles[key]}`}>
          <i><HarinIcon name={icon} size={20}/></i>
          <span><small>{label}</small><b>{metrics[key].value}</b><em>{metrics[key].hint}</em></span>
        </article>
        {index<FLOW_COPY.length-1?<span className={styles.connector} aria-hidden="true"><i/></span>:null}
      </div>)}
    </div>
    <div className={styles.decisionArea}>
      <article className={styles.waste}>
        <span><i><HarinIcon name="warning" size={20}/></i><span><small>주문 없이 쓴 광고비</small><b>{won(summary.noOrderSpend)}</b></span></span>
        <em>{summary.noOrderSpend==null?'주문과 광고비 근거가 모이면 계산해요.':summary.noOrderSpend>0?'먼저 감액·제외 후보를 확인하세요.':'확인 범위에서 낭비 신호가 없어요.'}</em>
      </article>
      <div className={styles.actions} aria-label="입찰 행동 분포">
        <header><span><b>지금 판단할 키워드</b><small>운영 중 {summary.operational.length.toLocaleString('ko-KR')}개 기준</small></span><em>{isCoupang?'WING 적용 목록으로 전달':'선택 후 변경값 입력'}</em></header>
        <div className={styles.actionRail} aria-hidden="true">{actionCopy.map(([key])=><i className={styles[key]} style={{'--keyword-action-ratio':actionTotal?summary.actions[key]/actionTotal:0}} key={key}/>)}</div>
        <ul>{actionCopy.map(([key,label,hint])=><li key={key}><i className={styles[key]}/><span><b>{label}</b><small>{hint}</small></span><strong>{summary.actions[key].toLocaleString('ko-KR')}개</strong></li>)}</ul>
      </div>
    </div>
  </section>;
}
