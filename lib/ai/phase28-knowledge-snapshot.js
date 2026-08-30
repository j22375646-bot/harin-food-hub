'use strict';

const openaiClient=require('./openai-client.js');
const knowledgeCenter=require('./knowledge-center.js');
const analysisContracts=require('./analysis-contracts.js');

const KNOWLEDGE_FIELDS='id,title,category,version_label,status,scope_pages,source_type,source_label,source_status,source_file_name,source_mime_type,source_size_bytes,source_sha256,source_uploaded_at,notes,privacy_status,vector_status,approved_at,created_at,updated_at';

async function loadPhase28KnowledgeSnapshot({db,now=new Date(),configuration=openaiClient.configuration,contracts=analysisContracts.listContracts}={}){
  if(!db||typeof db.from!=='function')throw new Error('AI 기준자료 데이터 연결을 확인해주세요.');
  const found=await db.from('ai_knowledge_documents').select(KNOWLEDGE_FIELDS).order('updated_at',{ascending:false}).limit(120);
  if(found?.error)throw new Error(String(found.error.message||found.error));
  const config=configuration()||{};
  return {
    generatedAt:now instanceof Date?now.toISOString():new Date(now).toISOString(),
    items:Array.isArray(found?.data)?found.data:[],
    categories:knowledgeCenter.CATEGORIES,
    pageLabels:knowledgeCenter.PAGE_LABELS,
    recommended:knowledgeCenter.RECOMMENDED_DOCUMENTS,
    analysisContracts:contracts(),
    guard:{
      execution_enabled:config.execution_enabled===true,
      file_search_configured:config.file_search_configured===true,
      source_uploads_enabled:true,
      openai_uploads_enabled:false
    }
  };
}

module.exports={KNOWLEDGE_FIELDS,loadPhase28KnowledgeSnapshot};
