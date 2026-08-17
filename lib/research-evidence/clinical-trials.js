'use strict';

const utils=require('../public-evidence/candidate-utils.js');
const API_URL='https://clinicaltrials.gov/api/v2/studies';
const FIELDS='NCTId|BriefTitle|OfficialTitle|OverallStatus|StudyType|Phase|Condition|InterventionName|StartDate|CompletionDate|EnrollmentCount|LeadSponsorName|LastUpdatePostDate';

function requestUrl({query,limit=6}={}){
  const term=utils.cleanText(query,140);
  if(!term){const error=new Error('ClinicalTrials.gov에서 확인할 상품명·원료명·학명을 입력해주세요.');error.code='CLINICAL_TRIALS_QUERY_REQUIRED';error.status=400;throw error;}
  const url=new URL(API_URL);url.searchParams.set('query.term',term);url.searchParams.set('pageSize',String(Math.min(10,Math.max(1,Number(limit)||6))));url.searchParams.set('format','json');url.searchParams.set('fields',FIELDS);return url.toString();
}

function list(values,maxItems=8,maxLength=180){return (Array.isArray(values)?values:[]).map(value=>utils.cleanText(value,maxLength)).filter(Boolean).slice(0,maxItems);}
function dateText(value){return utils.cleanText(value?.date||value,40)||null;}

function normalizeStudy(study={},fetchedAt=new Date().toISOString()){
  const protocol=study.protocolSection||{},identification=protocol.identificationModule||{},status=protocol.statusModule||{},design=protocol.designModule||{},conditions=protocol.conditionsModule||{},interventions=protocol.armsInterventionsModule||{},sponsors=protocol.sponsorCollaboratorsModule||{};
  const nctId=utils.cleanText(identification.nctId,40);if(!/^NCT\d{8}$/u.test(nctId))return null;
  const title=utils.cleanText(identification.briefTitle||identification.officialTitle,300)||nctId;
  const overallStatus=utils.cleanText(status.overallStatus,80),studyType=utils.cleanText(design.studyType,80),phases=list(design.phases,6,60),conditionList=list(conditions.conditions,8,160),interventionNames=list(interventions.interventions?.map(item=>item?.name),8,160);
  const enrollment=Number(design.enrollmentInfo?.count)||null,leadSponsor=utils.cleanText(sponsors.leadSponsor?.name,180);
  const startDate=dateText(status.startDateStruct),completionDate=dateText(status.completionDateStruct),updatedDate=dateText(status.lastUpdatePostDateStruct);
  const sourceUrl=`https://clinicaltrials.gov/study/${encodeURIComponent(nctId)}`;
  const sourceDate=utils.dateValue(updatedDate||startDate)||null;
  const facts=[overallStatus&&`등록상태 ${overallStatus}`,studyType&&`연구유형 ${studyType}`,phases.length&&`단계 ${phases.join(', ')}`,conditionList.length&&`대상 ${conditionList.join(', ')}`,enrollment&&`등록 ${enrollment}명`].filter(Boolean);
  const candidate={provider:'CLINICAL_TRIALS',evidence_kind:'CLINICAL_TRIAL_REGISTRY',title,summary:`${facts.join(' · ')} · 임상시험 등록 정보이며 결과나 선택 상품의 효과를 입증하는 결론이 아닙니다.`.slice(0,4000),source_url:sourceUrl,source_name:'ClinicalTrials.gov',source_date:sourceDate,image_url:null,external_id:nctId,fetched_at:fetchedAt,metadata:{nct_id:nctId,overall_status:overallStatus,study_type:studyType,phases,conditions:conditionList,interventions:interventionNames,enrollment,lead_sponsor:leadSponsor,start_date:startDate,completion_date:completionDate,updated_date:updatedDate}};
  candidate.external_key=utils.externalKey(candidate.provider,candidate.external_id,candidate.source_url);return candidate;
}

async function probe({query,limit=6,fetchImpl=fetch,now=new Date()}){
  const response=await fetchImpl(requestUrl({query,limit}),{headers:{accept:'application/json'}});
  if(!response.ok){const error=new Error(`ClinicalTrials.gov가 HTTP ${response.status}로 응답했습니다.`);error.code='CLINICAL_TRIALS_HTTP_ERROR';error.status=502;throw error;}
  let payload;try{payload=await response.json();}catch{const error=new Error('ClinicalTrials.gov 응답을 읽을 수 없습니다.');error.code='CLINICAL_TRIALS_PARSE_ERROR';error.status=502;throw error;}
  const fetchedAt=new Date(now).toISOString(),candidates=(payload?.studies||[]).map(item=>normalizeStudy(item,fetchedAt)).filter(Boolean);
  return {provider:'CLINICAL_TRIALS',status:candidates.length?'SUCCESS':'NO_DATA',candidates,totalCount:candidates.length,hasMore:Boolean(payload?.nextPageToken)};
}

module.exports={API_URL,FIELDS,requestUrl,normalizeStudy,probe};
