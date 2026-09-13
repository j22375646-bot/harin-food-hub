'use strict';
function failure(code) { return Object.assign(new Error(code), { code }); }
function assertProviderAllowed({provider,dataClass,enabled,ready}={}) {
  if (!['CLOVA','GEMINI_FREE'].includes(provider)) throw failure('PROVIDER_DISABLED');
  if ((provider==='CLOVA' && dataClass!=='INTERNAL_AGGREGATE') || (provider==='GEMINI_FREE' && dataClass!=='PUBLIC_MARKET')) throw failure('DATA_POLICY_BLOCKED');
  if (enabled!==true) throw failure('DISABLED');
  if (ready!==true) throw failure('SETUP_REQUIRED');
  return true;
}
function classifyQuestion(question='',scope='NAVER_AD_REPORT') {
  // Fail closed on recognizable identifiers; this is not a complete free-text PII detector.
  const privateIdentifier=/(?:\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b|(?:\+?82[-\s]?)?0?1[016789][-\s]?\d{3,4}[-\s]?\d{4}|\b0(?:2|[3-6]\d|70)[-\s]?\d{3,4}[-\s]?\d{4}\b|\b\d{6}[-\s]?[1-8]\d{6}\b)/i.test(question);
  if(privateIdentifier)return {allowed:false,code:'QUESTION_PRIVACY_BLOCKED',scope,answer:'전화번호·이메일·주민등록번호 등 개인정보를 제거하고 광고 지표만 질문해 주세요.'};
  const outside=scope!=='NAVER_AD_REPORT'||/(쿠팡|카페24|전체\s*(주문|매출)|다른\s*(사업장|테넌트)|고객.*(주소|전화|연락처)|발송|출고|발급|삭제|실행해|변경해|설정해|ignore.*instruction|system\s*prompt|select\s+.+from|https?:\/\/)/i.test(question);
  return {allowed:!outside,code:outside?'OUT_OF_SCOPE':'IN_SCOPE',scope,answer:outside?'현재 자료로는 확인할 수 없어요. 네이버 광고 저장 보고서의 지표만 설명할 수 있으며, 전체 주문 매출과 다른 채널은 별도 자료가 필요해요.':''};
}
module.exports={assertProviderAllowed,classifyQuestion};
