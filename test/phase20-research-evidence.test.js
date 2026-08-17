'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const config=require('../lib/research-evidence/config.js');
const pubmed=require('../lib/research-evidence/pubmed.js');
const clinicalTrials=require('../lib/research-evidence/clinical-trials.js');
const crossref=require('../lib/research-evidence/crossref.js');
const utils=require('../lib/public-evidence/candidate-utils.js');
const research=require('../lib/market-intelligence/research-evidence.js');

const root=path.join(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

test('phase 20-1 research providers are free-ready and keep optional credentials server-only',()=>{
  const env={NCBI_EUTILS_API_KEY:'optional-key',NCBI_EUTILS_EMAIL:'developer@example.com',CROSSREF_MAILTO:'developer@example.com'};
  const pubmedConfig=config.providerConfig('PUBMED',env),clinicalConfig=config.providerConfig('CLINICAL_TRIALS',env),crossrefConfig=config.providerConfig('CROSSREF',env);
  assert.equal(pubmedConfig.apiKey,'optional-key');assert.equal(pubmedConfig.enabled,true);
  assert.equal(Object.hasOwn(clinicalConfig,'apiKey'),false);assert.equal(clinicalConfig.enabled,true);
  assert.equal(crossrefConfig.mailto,'developer@example.com');assert.deepEqual(config.missingFields(),[]);
});

test('PubMed adapter uses ESearch then ESummary and stores bibliography without abstract or secrets',async()=>{
  const requested=[];
  const result=await pubmed.probe({config:{tool:'harin_food_hub',email:'developer@example.com',apiKey:'private-key'},query:'Canavalia gladiata',limit:2,now:new Date('2026-08-18T00:00:00.000Z'),fetchImpl:async url=>{
    requested.push(String(url));
    if(String(url).includes('esearch.fcgi'))return {ok:true,json:async()=>({esearchresult:{count:'1',idlist:['42064313']}})};
    return {ok:true,json:async()=>({result:{uids:['42064313'],'42064313':{uid:'42064313',title:'Canavalia study',sortpubdate:'2026/04/15 00:00',fulljournalname:'Plant Journal',authors:[{name:'Kim A'}],pubtype:['Journal Article'],lang:['eng'],articleids:[{idtype:'pubmed',value:'42064313'},{idtype:'doi',value:'10.1000/example'}],abstract:'must never be saved'}}})};
  }});
  assert.equal(result.status,'SUCCESS');assert.equal(result.candidates[0].metadata.pmid,'42064313');assert.equal(result.candidates[0].metadata.doi,'10.1000/example');
  assert.equal(result.candidates[0].source_date,'2026-04-15');assert.doesNotMatch(JSON.stringify(result.candidates[0]),/must never be saved|private-key|developer@example/u);
  assert.match(requested[0],/esearch\.fcgi/u);assert.match(requested[1],/esummary\.fcgi/u);assert.match(requested[0],/api_key=private-key/u);
});

test('ClinicalTrials.gov v2 adapter preserves registry status without treating it as a result',async()=>{
  let requested='';
  const result=await clinicalTrials.probe({query:'green tea',limit:1,now:new Date('2026-08-18T00:00:00.000Z'),fetchImpl:async url=>{requested=String(url);return {ok:true,json:async()=>({studies:[{protocolSection:{identificationModule:{nctId:'NCT12345678',briefTitle:'Green tea registry'},statusModule:{overallStatus:'RECRUITING',startDateStruct:{date:'2026-01-01'},lastUpdatePostDateStruct:{date:'2026-08-01'}},designModule:{studyType:'INTERVENTIONAL',phases:['PHASE2'],enrollmentInfo:{count:40}},conditionsModule:{conditions:['Nutrition']},armsInterventionsModule:{interventions:[{name:'Green tea'}]},sponsorCollaboratorsModule:{leadSponsor:{name:'Public University'}}}}]})};}});
  assert.match(requested,/clinicaltrials\.gov\/api\/v2\/studies/u);assert.match(requested,/query\.term=green\+tea/u);assert.match(requested,/fields=/u);
  const candidate=result.candidates[0];assert.equal(candidate.metadata.nct_id,'NCT12345678');assert.equal(candidate.metadata.overall_status,'RECRUITING');assert.equal(candidate.source_date,'2026-08-01');assert.match(candidate.summary,/결과나 선택 상품의 효과를 입증하는 결론이 아닙니다/u);
  assert.equal(Object.hasOwn(candidate.metadata,'contacts'),false);
});

test('Crossref enriches only DOI citation metadata and ignores abstracts',async()=>{
  const candidate=pubmed.normalizeSummary({uid:'42064313',title:'Study',sortpubdate:'2026/04/15 00:00',source:'Journal',articleids:[{idtype:'doi',value:'10.1000/example'}]},'2026-08-18T00:00:00.000Z');
  const enriched=await crossref.enrichCandidate(candidate,{config:{mailto:'developer@example.com'},fetchImpl:async()=>({ok:true,json:async()=>({message:{'is-referenced-by-count':12,publisher:'Publisher',type:'journal-article',issued:{'date-parts':[[2026,4,15]]},'container-title':['Journal'],abstract:'must not be stored'}})})});
  assert.equal(enriched.metadata.citation_count,12);assert.equal(enriched.metadata.crossref_publisher,'Publisher');assert.equal(enriched.metadata.crossref_issued,'2026-04-15');assert.doesNotMatch(JSON.stringify(enriched),/must not be stored|developer@example/u);
});

test('research candidates are signed, host-restricted and normalized as product-isolated PROXY evidence',()=>{
  const candidate=pubmed.normalizeSummary({uid:'42064313',title:'Study',sortpubdate:'2026/04/15 00:00',source:'Journal',authors:[{name:'Kim A'}],pubtype:['Journal Article'],articleids:[{idtype:'doi',value:'10.1000/example'}]},'2026-08-18T00:00:00.000Z');
  const token=utils.signCandidate(candidate,'test-secret'),restored=research.candidateFromInput({...candidate,candidate_token:token});
  assert.equal(utils.verifyCandidate(restored,token,'test-secret'),true);assert.equal(restored.external_key,candidate.external_key);
  assert.throws(()=>research.candidateFromInput({...candidate,source_url:'https://evil.example.com'}),/공식 연구자료 원문/);
  const service=read('lib/market-intelligence/research-evidence.js');
  assert.match(service,/evidence_type:'PROXY'/);assert.match(service,/status:'OWNER_CONFIRMATION_REQUIRED'/);assert.match(service,/RESEARCH_EVIDENCE_CANDIDATE_SAVED/);assert.match(service,/Promise\.allSettled/);assert.doesNotMatch(service,/NEXT_PUBLIC_/);
});

test('research Evidence route is owner-authenticated and page stays manual with separate page AI',()=>{
  const route=read('app/api/market-intelligence/projects/[projectId]/research-evidence/route.js');
  const client=read('app/market-intelligence/[projectId]/data/research-evidence-client.js');
  const workspace=read('app/market-intelligence/[projectId]/workspace-page.js');
  assert.match(route,/isAuthorized\(request,authModule\)/);assert.match(route,/maxBytes:64\*1024/);
  assert.match(client,/연구자료는 판매문구가 아니에요/);assert.match(client,/외부 API는 이 버튼을 눌렀을 때만 호출/);assert.match(client,/API 키는 없어도 시작/);
  assert.match(workspace,/MarketResearchEvidence/);assert.match(workspace,/MarketPageAi/);assert.ok(workspace.indexOf('MarketResearchEvidence')<workspace.indexOf('MarketPageAi projectId'));
});

test('research Evidence UI has readable mobile controls and optional-key environment notes',()=>{
  const css=read('app/_analysis/harin-market-intelligence.css'),env=read('.env.example');
  assert.match(css,/\.marketResearchEvidenceWorkbench/);assert.match(css,/@media\(max-width:700px\)[^{]*\{[^}]*\.harinV8 \.marketResearchEvidenceWorkbench/);
  assert.match(css,/\.marketResearchEvidenceWorkbench button[^}]*min-height:48px/u);
  assert.match(env,/NCBI_EUTILS_API_KEY=/);assert.match(env,/CLINICAL_TRIALS_ENABLED=true/);assert.match(env,/CROSSREF_ENABLED=true/);assert.doesNotMatch(env,/NEXT_PUBLIC_NCBI|NEXT_PUBLIC_CROSSREF/u);
});
