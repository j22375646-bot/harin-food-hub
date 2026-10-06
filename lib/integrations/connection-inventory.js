'use strict';
const JOBS={COUPANG:{ORDERS_REALTIME:'판매자배송 주문',RG_INVENTORY:'로켓그로스 재고',RG_REALTIME:'로켓그로스 실시간 자료',CUSTOMER_SERVICE:'고객 문의·클레임',FETCH_ALL:'통합 수집'},NAVER:{COMMERCE_SYNC:'커머스 상품·주문',CUSTOMER_SERVICE:'고객 문의',COMMERCE_PAYMENT_PERIOD:'정산 기간',FETCH_ALL:'검색광고 성과',SEARCH_TERMS:'광고 검색어'},CAFE24:{FETCH_ALL:'상품·주문 통합',ORDERS_REALTIME:'주문',CUSTOMER_SERVICE:'문의·클레임'}};
const stamp=v=>typeof v==='string'&&Number.isFinite(Date.parse(v))?v:null;
async function collection(db,provider){
 const definitions=JOBS[provider];if(!definitions)return {status:'ON_DEMAND',jobs:[]};
 try{const results=await Promise.all(Object.entries(definitions).map(async([type,label])=>{
  const r=await db.from('sync_logs').select('status,started_at,finished_at').eq('platform',provider).eq('job_type',type).order('started_at',{ascending:false}).limit(1).maybeSingle();
  if(r.error)throw Error('read');const v=r.data;return {label,status:v&&['RUNNING','SUCCESS','PARTIAL','FAILED'].includes(v.status)?v.status:'UNKNOWN',startedAt:stamp(v?.started_at),finishedAt:stamp(v?.finished_at)};
 }));return {status:'READY',jobs:results};}catch{return {status:'UNAVAILABLE',jobs:[]};}
}
function services(env){
 const config=require('../operations-health/config.js'),rows=[];
 for(const [provider,label,usage,needed] of [['AWS_CLOUDWATCH','AWS CloudWatch','고정 IP 서버의 CPU·장애 확인',['accessKeyId','secretAccessKey','instanceId']],['VERCEL','Vercel 운영 API','웹 서버 배포·상태 조회',['token','projectId']],['GITHUB_RELEASES','GitHub 릴리스 API','릴리스 정보 조회',[]],['UPTIMEROBOT','UptimeRobot','외부 가동 상태 확인',['apiKey']],['TELEGRAM_BOT','Telegram Bot','모바일 운영 알림',['token','chatId']],['RESEND','Resend','보고서 이메일',['apiKey']]]){
  const c=config.providerConfig(provider,env);rows.push({provider,label,usage,status:!c.enabled?'DISABLED':needed.every(k=>Boolean(c[k]))?'CONFIGURED':'SETUP_REQUIRED',writeEnabled:c.writesEnabled===true});
 }
 const google=require('../google-owned-site/config.js');for(const [provider,label,usage]of [['GA4','Google Analytics 4','자사몰 유입·구매 전환'],['SEARCH_CONSOLE','Google Search Console','자사몰 검색 노출·클릭'],['PAGESPEED','PageSpeed Insights','자사몰 속도 진단'],['CRUX','Chrome UX Report','실사용자 성능 지표']]){const c=google.providerConfig(provider,env);rows.push({provider,label,usage,status:!c.enabled?'DISABLED':google.missingFields(provider,c).length?'SETUP_REQUIRED':'CONFIGURED'});}
 rows.push({provider:'OPENAI',label:'OpenAI',usage:'분석 설명·AI 보고서',status:!env.OPENAI_API_KEY?'SETUP_REQUIRED':String(env.OPENAI_ANALYSIS_ENABLED).toLowerCase()==='true'?'CONFIGURED':'DISABLED'});
 return rows;
}
module.exports={collection,services};
