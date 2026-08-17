'use strict';

const PROVIDERS=Object.freeze({
  PUBMED:'PUBMED',
  CLINICAL_TRIALS:'CLINICAL_TRIALS',
  CROSSREF:'CROSSREF'
});

const SEARCH_PROVIDERS=Object.freeze([PROVIDERS.PUBMED,PROVIDERS.CLINICAL_TRIALS]);
const DEFINITIONS=Object.freeze([
  {provider:PROVIDERS.PUBMED,label:'PubMed',subtitle:'논문 색인·PMID·DOI',icon:'document',tone:'blue',role:'SEARCH'},
  {provider:PROVIDERS.CLINICAL_TRIALS,label:'ClinicalTrials.gov',subtitle:'임상시험 등록·상태·NCT 번호',icon:'shield',tone:'mint',role:'SEARCH'},
  {provider:PROVIDERS.CROSSREF,label:'Crossref',subtitle:'DOI·출판사·인용 메타데이터 보완',icon:'link',tone:'lavender',role:'ENRICHMENT'}
]);

const text=(env,key)=>String(env?.[key]||'').trim();
const enabled=(env,key)=>text(env,key).toLowerCase()!=='false';

function providerConfig(provider,env=process.env){
  if(provider===PROVIDERS.PUBMED)return {provider,enabled:enabled(env,'NCBI_EUTILS_ENABLED'),apiKey:text(env,'NCBI_EUTILS_API_KEY'),tool:text(env,'NCBI_EUTILS_TOOL')||'harin_food_hub',email:text(env,'NCBI_EUTILS_EMAIL')};
  if(provider===PROVIDERS.CLINICAL_TRIALS)return {provider,enabled:enabled(env,'CLINICAL_TRIALS_ENABLED')};
  if(provider===PROVIDERS.CROSSREF)return {provider,enabled:enabled(env,'CROSSREF_ENABLED'),mailto:text(env,'CROSSREF_MAILTO')};
  throw new Error(`Unsupported research Evidence provider: ${provider}`);
}

function missingFields(){return [];}

module.exports={PROVIDERS,SEARCH_PROVIDERS,DEFINITIONS,providerConfig,missingFields};
