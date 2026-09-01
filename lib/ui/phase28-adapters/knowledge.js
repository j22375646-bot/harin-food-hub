'use strict';

const operatingRuleDomain=require('../../ai/operating-rules.js');

const STATUS_LABELS=Object.freeze({DRAFT:'작성 중',READY:'검수 완료',ACTIVE:'적용 대상',ARCHIVED:'보관'});
const PRIVACY_LABELS=Object.freeze({REVIEW_REQUIRED:'개인정보 검수 필요',APPROVED:'개인정보 제외 확인',BLOCKED:'사용 금지'});
const VECTOR_LABELS=Object.freeze({NOT_CONNECTED:'검색 미연결',QUEUED:'연결 대기',PROCESSING:'자료 처리 중',READY:'검색 준비 완료',FAILED:'연결 실패'});
const SOURCE_LABELS=Object.freeze({NOT_UPLOADED:'원본 없음',UPLOAD_PENDING:'업로드 확인 중',STORED:'원본 보관 완료',FAILED:'원본 보관 실패'});

function bytes(value){
  const size=Number(value);
  if(!Number.isFinite(size)||size<=0)return '크기 확인 필요';
  if(size<1024)return `${size}B`;
  if(size<1024*1024)return `${(size/1024).toFixed(1)}KB`;
  return `${(size/1024/1024).toFixed(1)}MB`;
}

function itemModel(item,categories,pageLabels){
  const sourceStatus=String(item.source_status||'NOT_UPLOADED');
  const privacyStatus=String(item.privacy_status||'REVIEW_REQUIRED');
  const vectorStatus=String(item.vector_status||'NOT_CONNECTED');
  const status=String(item.status||'DRAFT');
  const scopes=Array.isArray(item.scope_pages)?item.scope_pages:[];
  const hash=String(item.source_sha256||'').trim();
  const ready=sourceStatus==='STORED'&&privacyStatus==='APPROVED'&&status==='ACTIVE';
  return Object.freeze({
    id:String(item.id),title:String(item.title||'자료 이름 확인 필요'),category:String(item.category||'PLANNING'),
    categoryLabel:categories[item.category]||String(item.category||'자료 종류 확인 필요'),versionLabel:String(item.version_label||'버전 확인 필요'),
    status,statusLabel:STATUS_LABELS[status]||'상태 확인 필요',privacyStatus,privacyLabel:PRIVACY_LABELS[privacyStatus]||'개인정보 상태 확인 필요',
    vectorStatus,vectorLabel:VECTOR_LABELS[vectorStatus]||'검색 상태 확인 필요',sourceStatus,sourceLabel:SOURCE_LABELS[sourceStatus]||'원본 상태 확인 필요',
    scopePages:Object.freeze(scopes.slice()),scopeLabels:Object.freeze(scopes.map(scope=>pageLabels[scope]||scope)),
    sourceName:item.source_file_name||item.source_label||'원본 이름 확인 필요',sourceMimeType:item.source_mime_type||null,sourceSizeLabel:bytes(item.source_size_bytes),
    sourceHashLabel:hash?`SHA-256 · ${hash.slice(0,12)}…${hash.slice(-4)}`:'SHA-256 · 확인 필요',
    notes:item.notes||null,sourceUploadedAt:item.source_uploaded_at||null,approvedAt:item.approved_at||null,createdAt:item.created_at||null,updatedAt:item.updated_at||null,
    ready,activationLabel:ready?'운영 설명에 참고 가능':privacyStatus==='BLOCKED'?'사용 금지':sourceStatus!=='STORED'?'원본 보관 필요':privacyStatus!=='APPROVED'?'개인정보 검수 필요':'적용 승인 필요',
    actions:Object.freeze({canReview:sourceStatus==='STORED'&&privacyStatus==='REVIEW_REQUIRED'&&status==='DRAFT',canActivate:sourceStatus==='STORED'&&privacyStatus==='APPROVED'&&status==='READY',canArchive:status!=='ARCHIVED',canRestore:status==='ARCHIVED',canDownload:sourceStatus==='STORED'})
  });
}

function operatingRuleModel(item={}){
  const config=item.config||{};
  const definition=item.definition||operatingRuleDomain.RULE_DEFINITIONS[item.ruleKey]||{};
  const fields=(definition.fields||[]).map(field=>Object.freeze({...field,value:Number(config[field.key])}));
  return Object.freeze({
    ruleKey:String(item.ruleKey||''),title:String(item.title||'운영 규칙'),version:Number(item.version)||1,versionLabel:`v${Number(item.version)||1}`,
    createdAt:item.createdAt||null,changeNote:item.changeNote||null,source:item.source||'DEFAULT',
    kicker:String(definition.kicker||'OPERATING RULE'),icon:String(definition.icon||'checklist'),description:String(definition.description||''),
    appliesTo:Object.freeze([...(definition.appliesTo||[])]),appliesToLabel:(definition.appliesTo||[]).join(' · '),
    config:Object.freeze({...config}),fields:Object.freeze(fields),enabled:config.enabled!==false
  });
}

function buildPhase28KnowledgeModel(snapshot={}){
  const failed=Boolean(snapshot.error);
  const categories=Object.freeze({...snapshot.categories});
  const pageLabels=Object.freeze({...snapshot.pageLabels});
  const items=failed?[]:(Array.isArray(snapshot.items)?snapshot.items:[]).map(item=>itemModel(item,categories,pageLabels));
  const ruleCurrent=snapshot.operatingRules?.current||{};
  const operatingRuleItems=operatingRuleDomain.RULE_KEYS.map(key=>ruleCurrent[key]).filter(Boolean).map(operatingRuleModel);
  const guard=snapshot.guard||{};
  return Object.freeze({
    generatedAt:snapshot.generatedAt||null,dataStatus:failed?'ERROR':'READY',error:snapshot.error||null,
    summary:failed?Object.freeze({total:null,active:null,reviewRequired:null,sourceStored:null,searchReady:null}):Object.freeze({
      total:items.filter(item=>item.status!=='ARCHIVED').length,
      active:items.filter(item=>item.status==='ACTIVE').length,
      reviewRequired:items.filter(item=>item.privacyStatus==='REVIEW_REQUIRED').length,
      sourceStored:items.filter(item=>item.sourceStatus==='STORED').length,
      searchReady:items.filter(item=>item.vectorStatus==='READY').length,
      operatingRules:operatingRuleItems.length
    }),
    items:Object.freeze(items),categories,pageLabels,operatingRules:Object.freeze(operatingRuleItems),
    recommended:Object.freeze(Array.isArray(snapshot.recommended)?snapshot.recommended.map(item=>Object.freeze({...item})):[]),
    analysisContracts:Object.freeze(Array.isArray(snapshot.analysisContracts)?snapshot.analysisContracts.map(item=>Object.freeze({...item})):[]),
    policy:Object.freeze({privateSourceOnly:true,privacyReviewRequired:true,pageScopeIsolation:true,directWritesForbidden:true,sourceUploadsEnabled:guard.source_uploads_enabled===true,openAiUploadsEnabled:guard.openai_uploads_enabled===true,executionEnabled:guard.execution_enabled===true,fileSearchConfigured:guard.file_search_configured===true})
  });
}

module.exports={buildPhase28KnowledgeModel};
