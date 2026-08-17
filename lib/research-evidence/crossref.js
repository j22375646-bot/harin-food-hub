'use strict';

const utils=require('../public-evidence/candidate-utils.js');
const API_URL='https://api.crossref.org/works';

function issuedDate(message={}){
  const parts=message?.issued?.['date-parts']?.[0];
  if(!Array.isArray(parts)||!parts.length)return null;
  return [parts[0],String(parts[1]||1).padStart(2,'0'),String(parts[2]||1).padStart(2,'0')].join('-');
}

async function metadata({doi,config={},fetchImpl=fetch}){
  const value=utils.cleanText(doi,200);if(!value)return null;
  const headers={accept:'application/json','user-agent':`HarinFoodHub/1.0${config.mailto?` (mailto:${String(config.mailto).slice(0,180)})`:''}`};
  const response=await fetchImpl(`${API_URL}/${encodeURIComponent(value)}`,{headers});
  if(response.status===404)return null;
  if(!response.ok){const error=new Error(`Crossref가 HTTP ${response.status}로 응답했습니다.`);error.code='CROSSREF_HTTP_ERROR';error.status=502;throw error;}
  let payload;try{payload=await response.json();}catch{const error=new Error('Crossref 응답을 읽을 수 없습니다.');error.code='CROSSREF_PARSE_ERROR';error.status=502;throw error;}
  const item=payload?.message||{};
  return {doi:value,citation_count:Number(item['is-referenced-by-count'])||0,publisher:utils.cleanText(item.publisher,180),type:utils.cleanText(item.type,80),issued:issuedDate(item),container_title:utils.cleanText(Array.isArray(item['container-title'])?item['container-title'][0]:item['container-title'],180)};
}

async function enrichCandidate(candidate,{config={},fetchImpl=fetch}={}){
  const doi=candidate?.metadata?.doi;if(!doi)return candidate;
  const citation=await metadata({doi,config,fetchImpl});if(!citation)return candidate;
  return {...candidate,metadata:{...candidate.metadata,citation_count:citation.citation_count,crossref_publisher:citation.publisher,crossref_type:citation.type,crossref_issued:citation.issued,crossref_container_title:citation.container_title}};
}

module.exports={API_URL,issuedDate,metadata,enrichCandidate};
