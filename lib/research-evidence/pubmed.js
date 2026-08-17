'use strict';

const utils=require('../public-evidence/candidate-utils.js');
const BASE_URL='https://eutils.ncbi.nlm.nih.gov/entrez/eutils';

function queryText(value){
  const query=utils.cleanText(value,140);
  if(!query){const error=new Error('PubMed에서 확인할 상품명·원료명·학명을 입력해주세요.');error.code='PUBMED_QUERY_REQUIRED';error.status=400;throw error;}
  return query;
}

function commonParams(config={}){
  const params={tool:String(config.tool||'harin_food_hub').replace(/[^a-z0-9_-]/giu,'_').slice(0,80)||'harin_food_hub'};
  if(config.email)params.email=String(config.email).slice(0,180);
  if(config.apiKey)params.api_key=String(config.apiKey).slice(0,300);
  return params;
}

function requestUrl(path,params={}){
  const url=new URL(`${BASE_URL}/${path}`);
  Object.entries(params).forEach(([key,value])=>{if(value!==undefined&&value!==null&&value!=='')url.searchParams.set(key,String(value));});
  return url.toString();
}

async function readJson(url,fetchImpl=fetch){
  const response=await fetchImpl(url,{headers:{accept:'application/json'}});
  if(!response.ok){const error=new Error(`PubMed가 HTTP ${response.status}로 응답했습니다.`);error.code='PUBMED_HTTP_ERROR';error.status=502;throw error;}
  try{return await response.json();}catch{const error=new Error('PubMed 응답을 읽을 수 없습니다.');error.code='PUBMED_PARSE_ERROR';error.status=502;throw error;}
}

function idValue(row={},type){return (Array.isArray(row.articleids)?row.articleids:[]).find(item=>String(item?.idtype||'').toLowerCase()===type)?.value||null;}
function listText(values,maxItems=8,maxLength=160){return (Array.isArray(values)?values:[]).map(item=>utils.cleanText(typeof item==='string'?item:item?.name,maxLength)).filter(Boolean).slice(0,maxItems);}

function normalizeSummary(row={},fetchedAt=new Date().toISOString()){
  const pmid=utils.cleanText(row.uid||idValue(row,'pubmed'),40);
  if(!pmid)return null;
  const title=utils.cleanText(row.title,300)||`PubMed ${pmid}`;
  const doi=utils.cleanText(idValue(row,'doi'),200)||null;
  const journal=utils.cleanText(row.fulljournalname||row.source,180);
  const authors=listText(row.authors,8,120);
  const publicationTypes=listText(row.pubtype,8,100);
  const languages=listText(row.lang,6,30);
  const publicationDate=utils.cleanText(row.sortpubdate||row.epubdate||row.pubdate,40);
  const sourceDate=utils.dateValue(publicationDate)||null;
  const sourceUrl=`https://pubmed.ncbi.nlm.nih.gov/${encodeURIComponent(pmid)}/`;
  const facts=[journal&&`학술지 ${journal}`,publicationTypes.length&&`자료유형 ${publicationTypes.join(', ')}`,authors.length&&`저자 ${authors.join(', ')}`,`PMID ${pmid}`,doi&&`DOI ${doi}`].filter(Boolean);
  const candidate={provider:'PUBMED',evidence_kind:'RESEARCH_INDEX',title,summary:`${facts.join(' · ')} · 논문 색인 정보이며 선택 상품의 건강효과를 입증하는 결론이 아닙니다.`.slice(0,4000),source_url:sourceUrl,source_name:'PubMed',source_date:sourceDate,image_url:null,external_id:pmid,fetched_at:fetchedAt,metadata:{pmid,doi,journal,authors,publication_types:publicationTypes,languages,publication_date:publicationDate||null,citation_count:null,crossref_publisher:null,crossref_type:null,crossref_issued:null,crossref_container_title:null}};
  candidate.external_key=utils.externalKey(candidate.provider,candidate.external_id,candidate.source_url);
  return candidate;
}

async function probe({config={},query,limit=6,fetchImpl=fetch,now=new Date()}){
  const term=queryText(query),retmax=Math.min(10,Math.max(1,Number(limit)||6)),common=commonParams(config);
  const search=await readJson(requestUrl('esearch.fcgi',{db:'pubmed',term,retmode:'json',retmax,...common}),fetchImpl);
  const ids=(search?.esearchresult?.idlist||[]).map(value=>utils.cleanText(value,40)).filter(Boolean).slice(0,retmax);
  if(!ids.length)return {provider:'PUBMED',status:'NO_DATA',candidates:[],totalCount:Number(search?.esearchresult?.count)||0};
  const summary=await readJson(requestUrl('esummary.fcgi',{db:'pubmed',id:ids.join(','),retmode:'json',version:'2.0',...common}),fetchImpl);
  const fetchedAt=new Date(now).toISOString();
  const candidates=ids.map(id=>normalizeSummary(summary?.result?.[id],fetchedAt)).filter(Boolean);
  return {provider:'PUBMED',status:candidates.length?'SUCCESS':'NO_DATA',candidates,totalCount:Number(search?.esearchresult?.count)||candidates.length};
}

module.exports={BASE_URL,queryText,commonParams,requestUrl,normalizeSummary,probe};
