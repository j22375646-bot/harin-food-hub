'use strict';

const optionalProviders=require('../optional-providers/config.js');

const OPPORTUNITY_PRESETS=Object.freeze([
  {id:'PUBLIC_MEAL',label:'학교·공공급식',icon:'store',tone:'amber',description:'급식·식자재 납품 공고를 상품 규격과 함께 검토',needs:['식품 관련 신고·인증','납품 규격·단가표','생산·공급 가능 수량']},
  {id:'CORPORATE_WELFARE',label:'기업 복지·대량구매',icon:'shoppingBag',tone:'blue',description:'기업 복지몰·임직원 선물·정기 대량구매 가능성 검토',needs:['기업용 공급가','묶음·포장 구성','세금계산서·정산 조건']},
  {id:'INSTITUTION_GIFT',label:'기관 판촉·답례',icon:'product',tone:'lavender',description:'기관 행사·답례품·판촉물 수요에 맞는 구성 검토',needs:['최소 주문 수량','납기·포장 옵션','표시·광고 문구 검수']}
]);

const STATUS_LABELS=Object.freeze({
  READY:'준비됨',PARTIAL:'일부 준비',BLOCKED:'확인 필요',NOT_STARTED:'사업 시작 전',LOCKED:'연결 잠금',SETUP_REQUIRED:'키 입력 필요',READ_PROBE_REQUIRED:'읽기 확인 필요'
});

function bool(value){return value===true;}
function positive(value){const parsed=Number(value);return Number.isFinite(parsed)&&parsed>0;}
function evidenceCount(project){const config=project?.analysis_config||{};return new Set((config.evidence_ids||[]).filter(Boolean)).size;}
function providerStatus(config,snapshots=[]){
  if(!config.businessActive)return 'NOT_STARTED';
  if(!config.enabled)return 'LOCKED';
  if(!config.apiKey)return 'SETUP_REQUIRED';
  const attempt=[...snapshots].filter(row=>row.provider==='PUBLIC_PROCUREMENT').sort((a,b)=>new Date(b.fetched_at||0)-new Date(a.fetched_at||0))[0];
  if(!attempt)return 'READ_PROBE_REQUIRED';
  if(attempt.status==='SUCCESS')return 'READY';
  if(attempt.status==='NO_DATA')return 'PARTIAL';
  return 'BLOCKED';
}

function buildB2BReadiness({project={},product={},snapshots=[],env=process.env}={}){
  const provider=optionalProviders.providerConfig('PUBLIC_PROCUREMENT',env);
  const active=product?.is_active!==false;
  const named=Boolean(String(product?.name||project?.product_snapshot?.name||'').trim());
  const priced=positive(product?.selling_price??project?.product_snapshot?.selling_price);
  const verifiedEvidence=evidenceCount(project);
  const connectionStatus=providerStatus(provider,snapshots);
  const checks=[
    {id:'PRODUCT',label:'판매 중 기준상품',status:active&&named?'READY':'BLOCKED',detail:active&&named?String(product?.name||project?.product_snapshot?.name):'판매 중 상품을 다시 선택해주세요.'},
    {id:'PRICE',label:'기준 판매가',status:priced?'READY':'BLOCKED',detail:priced?'소비자 판매가 확인됨':'공급가 계산 전에 판매가 확인 필요'},
    {id:'EVIDENCE',label:'상품 근거',status:verifiedEvidence>0?'READY':'PARTIAL',detail:verifiedEvidence>0?`연결 Evidence ${verifiedEvidence}개`:'자료실의 검증 Evidence 연결 필요'},
    {id:'SUPPLY',label:'납품 서류·공급능력',status:'PARTIAL',detail:'사업자·식품 관련 서류, 최소수량, 납기 확인 필요'},
    {id:'PROVIDER',label:'나라장터 읽기 연결',status:connectionStatus,detail:connectionStatus==='NOT_STARTED'?'B2B 사업 시작 확인 전에는 호출하지 않음':connectionStatus==='READ_PROBE_REQUIRED'?'공식 API 읽기 확인만 남음':connectionStatus==='READY'?'물품 계약과정통합공개서비스 응답 확인됨':'키·활용승인·최근 응답 확인 필요'}
  ];
  const ready=checks.filter(item=>item.status==='READY').length;
  const blocked=checks.filter(item=>['BLOCKED','LOCKED','SETUP_REQUIRED'].includes(item.status)).length;
  const overall=blocked?'BLOCKED':ready===checks.length?'READY':'PARTIAL';
  return {
    phase:'21-9',mode:'READ_ONLY_PREPARATION',generatedAt:new Date().toISOString(),
    product:{id:String(product?.id||project?.master_product_id||''),name:String(product?.name||project?.product_snapshot?.name||'선택 상품'),sellingPrice:priced?Number(product?.selling_price??project?.product_snapshot?.selling_price):null,active},
    project:{id:String(project?.id||''),evidenceCount:verifiedEvidence},
    provider:{status:connectionStatus,label:STATUS_LABELS[connectionStatus],businessActive:bool(provider.businessActive),enabled:bool(provider.enabled),credentialReady:Boolean(provider.apiKey),externalCallsEnabled:false,automaticSubmission:false},
    checks,opportunityPresets:OPPORTUNITY_PRESETS,
    summary:{status:overall,label:STATUS_LABELS[overall],ready,total:checks.length,blocked,costKrw:0},
    nextAction:connectionStatus==='NOT_STARTED'?'상품·서류·공급 조건부터 준비하고, 실제 B2B 납품을 시작할 때 연결을 여세요.':connectionStatus==='READ_PROBE_REQUIRED'?'공식 공고를 읽기 전용으로 한 번 확인할 단계입니다.':connectionStatus==='READY'?'읽기 연결이 확인됐습니다. 실제 공고 탐색 기능은 별도 공고 API를 연결하기 전까지 자동 생성하지 않습니다.':'나라장터 서비스 키·활용승인·최근 응답을 다시 확인해주세요.',
    rules:['현재 화면은 실제 공고나 낙찰 가능성을 만들어내지 않습니다.','나라장터 자료는 사업 시작 확인과 키 입력 뒤 읽기 전용으로 연결합니다.','입찰·견적·계약 제출은 자동 실행하지 않고 사장님 확인을 거칩니다.','고객 이름·연락처·주소·주문정보는 조달 공급자에 보내지 않습니다.']
  };
}

module.exports={OPPORTUNITY_PRESETS,STATUS_LABELS,providerStatus,buildB2BReadiness};
