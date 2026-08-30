'use strict';

const STAGES=Object.freeze([
  Object.freeze({id:'data',label:'자료 준비',shortLabel:'근거',threshold:22,workspace:'data',description:'파일·출처·OCR 검수'}),
  Object.freeze({id:'market',label:'시장 분석',shortLabel:'시장',threshold:42,workspace:'market',description:'시장범위·수요 신호'}),
  Object.freeze({id:'conversion',label:'경쟁·전환 설계',shortLabel:'전환',threshold:64,workspace:'competition',description:'차별화·구매 장벽'}),
  Object.freeze({id:'experiment',label:'A/B 실험',shortLabel:'실험',threshold:82,workspace:'conversion',description:'가설·표본·성과 비교'}),
  Object.freeze({id:'learning',label:'결과 학습',shortLabel:'학습',threshold:100,workspace:'validation',description:'7일·14일 검증'}),
]);

const text=value=>String(value==null?'':value).trim();
const plainText=value=>text(value).replace(/<[^>]*>/g,' ').replace(/&nbsp;/gi,' ').replace(/\s+/g,' ').trim();
const finite=value=>value===null||value===undefined||value===''||!Number.isFinite(Number(value))?null:Number(value);
const frozenRows=rows=>Object.freeze(rows.map(row=>Object.freeze(row)));

function developmentSummary(value={}){
  const progress=Math.max(0,Math.min(100,finite(value.progress)||0));
  const status=text(value.key||value.status||'NOT_STARTED').toUpperCase();
  return Object.freeze({
    status,label:text(value.label)||(status==='NOT_STARTED'?'시작 전':'확인 필요'),progress,
    plans:finite(value.plans)||0,experiments:finite(value.experiments)||0,reports:finite(value.reports)||0,
    nextAction:text(value.next_label||value.nextAction)||(status==='NOT_STARTED'?'프로젝트 만들기':'개발 이어가기')
  });
}

function projectSummary(row={}){
  const development=developmentSummary(row.development||{});
  return Object.freeze({
    id:text(row.id),masterProductId:text(row.master_product_id),name:text(row.project_name)||'상품개발 프로젝트',
    status:text(row.status||'DRAFT').toUpperCase(),activeVersion:Math.max(1,finite(row.active_version)||1),
    href:text(row.href),updatedAt:row.updated_at||null,lastOpenedAt:row.last_opened_at||null,development
  });
}

function productSummary(row={}){
  const price=finite(row.selling_price);
  return Object.freeze({
    id:text(row.id),name:plainText(row.name)||'상품 확인 필요',price,
    priceLabel:price==null?'확인 필요':`${Math.round(price).toLocaleString('ko-KR')}원`,
    project:row.project?projectSummary(row.project):null,
    development:developmentSummary(row.development||{})
  });
}

function buildPhase28DevelopmentModel(data={}){
  const products=frozenRows((data.products||[]).map(productSummary));
  const projects=frozenRows((data.projects||[]).map(projectSummary));
  const source=data.summary||{};
  return Object.freeze({
    writePolicy:'GUARDED',generatedAt:data.generatedAt||null,error:text(data.error),products,projects,stages:STAGES,
    summary:Object.freeze({
      productCount:finite(source.saleable_products)??products.length,
      projectCount:finite(source.active_projects)??projects.filter(item=>item.status!=='ARCHIVED').length,
      versionCount:finite(source.versions)??projects.reduce((sum,item)=>sum+item.activeVersion,0),
      experimentCount:finite(source.experiments)??projects.reduce((sum,item)=>sum+item.development.experiments,0),
      learnedCount:finite(source.completed_products)??projects.filter(item=>item.development.status==='LEARNED').length
    }),
    policy:Object.freeze({
      selectionCreatesProject:false,projectIsolation:'master_product_id',copyEvidenceBetweenProducts:false,
      missingAsZero:false,automaticWrites:false,detailLoading:'ON_DEMAND',ownerConfirmationForCreate:true
    })
  });
}

module.exports={STAGES,buildPhase28DevelopmentModel,developmentSummary,projectSummary};
