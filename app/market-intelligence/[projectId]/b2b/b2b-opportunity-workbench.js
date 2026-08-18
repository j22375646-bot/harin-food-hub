import {HarinBadge,HarinButton,HarinCard,HarinPictogram,HarinProgressiveDetails,HarinSectionHeading,HarinStateCard} from '../../../_design-system/harin-ui.js';

const toneFor=status=>status==='READY'?'success':status==='PARTIAL'||status==='READ_PROBE_REQUIRED'?'warning':['BLOCKED','LOCKED','SETUP_REQUIRED'].includes(status)?'danger':'neutral';
const won=value=>value==null?'확인 필요':`${Math.round(Number(value)||0).toLocaleString('ko-KR')}원`;

export default function B2BOpportunityWorkbench({center}){
  const summary=center.summary||{};
  return <section className="b2bOpportunityWorkbench">
    <section className="b2bReadinessKpis" aria-label="B2B 준비 현황">
      <HarinStateCard tone={summary.status==='BLOCKED'?'warning':'success'} icon="checklist" label="전체 준비도" value={`${summary.ready}/${summary.total}`} description={summary.label}/>
      <HarinStateCard tone="neutral" icon="product" label="선택 상품" value={center.product.name} description={won(center.product.sellingPrice)}/>
      <HarinStateCard tone={center.provider.status==='READY'?'success':center.provider.status==='READ_PROBE_REQUIRED'?'warning':'neutral'} icon="store" label="나라장터 연결" value={center.provider.label} description="읽기 전용 · 자동 제출 없음"/>
      <HarinStateCard tone="success" icon="shield" label="현재 비용" value="0원" description="외부 API 호출 0회"/>
    </section>

    <HarinCard className="b2bFlowCard">
      <HarinSectionHeading eyebrow="B2B READINESS FLOW" title="납품 준비를 네 단계로 확인해요" description="상품을 바꾸면 이 상품의 프로젝트·근거만 사용해 다시 계산합니다." icon="store" aside={<HarinBadge tone={toneFor(summary.status)}>{summary.label}</HarinBadge>}/>
      <div className="b2bFlowRail">{[
        ['01','product','lavender','상품 적합성','판매 상태·가격·구성'],['02','document','blue','서류·공급','신고·인증·수량·납기'],['03','search','amber','공고 읽기','키 입력 뒤 읽기 전용'],['04','checklist','mint','사장님 검토','견적·입찰·계약 직접 승인']
      ].map(([number,icon,tone,title,description],index)=><article key={number}><i>{number}</i><HarinPictogram icon={icon} tone={tone} size={20}/><span><b>{title}</b><small>{description}</small></span>{index<3?<strong>›</strong>:null}</article>)}</div>
    </HarinCard>

    <section className="b2bOpportunitySection">
      <HarinSectionHeading eyebrow="OPPORTUNITY PRESETS" title="이 상품으로 검토할 납품 유형" description="실제 공고 목록이 아니라, 연결 전에 준비 범위를 정하는 프리셋입니다." icon="target"/>
      <div className="b2bOpportunityGrid">{center.opportunityPresets.map(item=><HarinCard className="b2bOpportunityCard" key={item.id}>
        <header><HarinPictogram icon={item.icon} tone={item.tone} size={22}/><HarinBadge tone="neutral">준비 프리셋</HarinBadge></header>
        <h3>{item.label}</h3><p>{item.description}</p><ul>{item.needs.map(need=><li key={need}>{need}</li>)}</ul>
      </HarinCard>)}</div>
    </section>

    <section className="b2bReadinessColumns">
      <HarinCard className="b2bChecklistCard">
        <HarinSectionHeading eyebrow="PRODUCT · DOCUMENT" title="지금 확인할 준비 항목" description="확인되지 않은 값은 0이나 완료로 표시하지 않아요." icon="checklist"/>
        <div className="b2bChecklist">{center.checks.map(item=><article key={item.id}><HarinPictogram icon={item.status==='READY'?'check':'warning'} tone={item.status==='READY'?'mint':'amber'} size={18}/><span><b>{item.label}</b><small>{item.detail}</small></span><HarinBadge tone={toneFor(item.status)}>{item.status==='READY'?'준비됨':item.status==='PARTIAL'?'확인 중':item.id==='PROVIDER'?center.provider.label:'확인 필요'}</HarinBadge></article>)}</div>
      </HarinCard>
      <HarinCard className="b2bConnectionCard" tone="soft">
        <header><HarinPictogram icon="shield" tone="lavender" size={24}/><span><small>SAFE CONNECTION</small><h3>{center.provider.status==='READY'?'나라장터 읽기 연결을 확인했어요':'나라장터는 자동 호출하지 않아요'}</h3></span></header>
        <p>{center.nextAction}</p><dl><div><dt>사업 시작 확인</dt><dd>{center.provider.businessActive?'확인됨':'아직'}</dd></div><div><dt>서버 안전 스위치</dt><dd>{center.provider.enabled?'열림':'잠금'}</dd></div><div><dt>서비스 키</dt><dd>{center.provider.credentialReady?'준비됨':'나중에 입력'}</dd></div><div><dt>자동 입찰·제출</dt><dd>사용 안 함</dd></div></dl>
        <HarinButton as="a" href="/data-collection/optional-providers" variant="secondary" icon="store">조달 API 준비 상태 보기</HarinButton>
      </HarinCard>
    </section>

    <HarinProgressiveDetails className="b2bRules" eyebrow="안전 운영" title="B2B·공공조달 운영 원칙" description="공고를 연결한 뒤에도 자동 제출은 하지 않습니다." count={`${center.rules.length}개 원칙`}>
      <ol>{center.rules.map(rule=><li key={rule}>{rule}</li>)}</ol>
    </HarinProgressiveDetails>

    <HarinProgressiveDetails className="b2bPageAi" eyebrow="이 페이지의 독립 AI" title="B2B 납품 준비도 분석" description={`${center.product.name}의 검증 자료와 B2B 준비 항목만 따로 분석합니다.`} count="사용 시작 전 · 비용 0원">
      <div className="b2bAiPreview"><HarinPictogram icon="ai" tone="lavender" size={22}/><span><b>현재는 서버 준비표만 사용해요.</b><p>OpenAI 호출·고객정보 전송·공고 자동 판단·입찰 제출 없이, 상품과 서류의 부족 항목만 보여줍니다.</p></span><HarinBadge tone="neutral">OpenAI 0회</HarinBadge></div>
    </HarinProgressiveDetails>
  </section>;
}
