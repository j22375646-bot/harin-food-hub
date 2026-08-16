'use strict';

const foundation=require('./foundation.js');
const projects=require('./projects.js');

const STORAGE_BUCKET='market-project-files';
const MAX_SOURCE_BYTES=20*1024*1024;
const MAX_OCR_CHARS=200000;
const ALLOWED_SOURCE_TYPES=Object.freeze({
  'application/pdf':'.pdf',
  'image/png':'.png',
  'image/jpeg':'.jpg',
  'image/webp':'.webp',
  'text/plain':'.txt',
  'text/markdown':'.md'
});
const SOURCE_SELECT='id,project_id,source_kind,display_name,file_name,mime_type,size_bytes,sha256,ingest_status,ocr_confidence,ocr_engine,ocr_error,owner_confirmed,owner_confirmed_at,uploaded_at,created_at,updated_at';
const EVIDENCE_SELECT='id,project_id,source_id,evidence_type,label,value_text,unit,source_locator,confidence,owner_confirmed,status,captured_at,created_at,updated_at';

class MarketDataRoomError extends Error{
  constructor(message,status=400,code='MARKET_DATA_ROOM_INVALID'){
    super(message);this.name='MarketDataRoomError';this.status=status;this.code=code;
  }
}

function requiredSourceId(value,label='자료'){
  try{return projects.requiredUuid(value,label);}catch{throw new MarketDataRoomError(`${label}를 다시 선택해주세요.`,400,'INVALID_SOURCE_ID');}
}
function cleanFileName(value){
  const name=String(value||'').trim().replace(/[\\/\0-\x1f]/g,'_').replace(/\s+/g,' ');
  if(!name||name.length>180)throw new MarketDataRoomError('파일 이름은 1~180자로 확인해주세요.');
  return name;
}
function validateSourceMetadata(input={}){
  const fileName=cleanFileName(input.file_name);
  const mimeType=String(input.mime_type||'').toLowerCase().trim();
  const sizeBytes=Number(input.size_bytes);
  if(!Object.hasOwn(ALLOWED_SOURCE_TYPES,mimeType))throw new MarketDataRoomError('PDF, PNG, JPG, WEBP, TXT, MD 파일만 올릴 수 있어요.',415,'UNSUPPORTED_SOURCE_TYPE');
  if(!Number.isSafeInteger(sizeBytes)||sizeBytes<1||sizeBytes>MAX_SOURCE_BYTES)throw new MarketDataRoomError('파일은 20MB 이하만 올릴 수 있어요.',413,'SOURCE_TOO_LARGE');
  return {file_name:fileName,display_name:String(input.display_name||fileName).trim().slice(0,180),mime_type:mimeType,size_bytes:sizeBytes};
}
function validateCompletion(input={},projectId,sourceId){
  const storagePath=String(input.storage_path||'').trim();
  const sha256=String(input.sha256||'').toLowerCase().trim();
  if(!storagePath.startsWith(`${projectId}/${sourceId}/`))throw new MarketDataRoomError('이 프로젝트에 발급한 업로드 경로가 아닙니다.',400,'INVALID_STORAGE_PATH');
  if(!/^[0-9a-f]{64}$/.test(sha256))throw new MarketDataRoomError('파일 무결성 값을 다시 확인해주세요.',400,'INVALID_SHA256');
  return {storage_path:storagePath,sha256};
}
function safeStorageName(fileName){
  const extension=(fileName.match(/\.[a-z0-9]{1,8}$/i)||[''])[0].toLowerCase();
  return `source${extension||'.bin'}`;
}
function normalizeSource(row={}){
  return {...row,size_bytes:row.size_bytes==null?null:Number(row.size_bytes),ocr_confidence:row.ocr_confidence==null?null:Number(row.ocr_confidence)};
}
function normalizeEvidenceRow(row={}){
  return {...row,confidence:row.confidence==null?null:Number(row.confidence)};
}
async function ensureProject(db,projectId){
  const project=await projects.loadProject({db,projectId});
  return project.project;
}
async function ensurePrivateBucket(db){
  const found=await db.storage.getBucket(STORAGE_BUCKET);
  if(found.data){if(found.data.public)throw new MarketDataRoomError('자료실 저장소가 공개 상태라 업로드를 중지했습니다.',503,'PUBLIC_BUCKET_BLOCKED');return;}
  const missing=found.error&&(Number(found.error.status)===404||/not found|does not exist/i.test(String(found.error.message)));
  if(found.error&&!missing)throw found.error;
  const created=await db.storage.createBucket(STORAGE_BUCKET,{public:false,fileSizeLimit:MAX_SOURCE_BYTES,allowedMimeTypes:Object.keys(ALLOWED_SOURCE_TYPES)});
  if(created.error&&!/already exists|duplicate/i.test(String(created.error.message)))throw created.error;
}
async function recordVersion(db,projectId,reason,snapshot,actor='OWNER'){
  const result=await db.rpc('record_market_project_version',{p_project_id:projectId,p_reason:reason,p_snapshot:snapshot||{},p_actor:String(actor||'OWNER').slice(0,160)});
  if(result.error)throw result.error;return Number(result.data);
}
async function loadDataRoom({db,projectId}){
  const project=await ensureProject(db,projectId);
  const [sourcesResult,evidenceResult]=await Promise.all([
    db.from('market_sources').select(SOURCE_SELECT).eq('project_id',project.id).order('created_at',{ascending:false}).limit(100),
    db.from('market_evidence').select(EVIDENCE_SELECT).eq('project_id',project.id).order('created_at',{ascending:false}).limit(200)
  ]);
  if(sourcesResult.error)throw sourcesResult.error;if(evidenceResult.error)throw evidenceResult.error;
  const sources=(sourcesResult.data||[]).map(normalizeSource),evidence=(evidenceResult.data||[]).map(normalizeEvidenceRow);
  return {sources,evidence,summary:{sources:sources.length,review_required:sources.filter(item=>['OCR_PENDING','REVIEW_REQUIRED'].includes(item.ingest_status)).length,verified_sources:sources.filter(item=>item.ingest_status==='VERIFIED').length,verified_evidence:evidence.filter(item=>item.status==='VERIFIED').length}};
}
async function prepareUpload({db,projectId,input,actor='OWNER'}){
  const project=await ensureProject(db,projectId),metadata=validateSourceMetadata(input);
  await ensurePrivateBucket(db);
  const inserted=await db.from('market_sources').insert({project_id:project.id,display_name:metadata.display_name,file_name:metadata.file_name,mime_type:metadata.mime_type,size_bytes:metadata.size_bytes,created_by:String(actor||'OWNER').slice(0,160)}).select('id').single();
  if(inserted.error)throw inserted.error;
  const storagePath=`${project.id}/${inserted.data.id}/${safeStorageName(metadata.file_name)}`;
  const updated=await db.from('market_sources').update({storage_bucket:STORAGE_BUCKET,storage_path:storagePath}).eq('id',inserted.data.id).eq('project_id',project.id);
  if(updated.error)throw updated.error;
  const signed=await db.storage.from(STORAGE_BUCKET).createSignedUploadUrl(storagePath);
  if(signed.error)throw signed.error;
  return {source_id:inserted.data.id,signed_url:signed.data.signedUrl,storage_path:storagePath,...metadata};
}
async function completeUpload({db,projectId,sourceId,input,actor='OWNER'}){
  const project=await ensureProject(db,projectId),id=requiredSourceId(sourceId),completion=validateCompletion(input,project.id,id);
  const sourceResult=await db.from('market_sources').select('id,project_id,file_name,mime_type,size_bytes,storage_path').eq('id',id).eq('project_id',project.id).maybeSingle();
  if(sourceResult.error)throw sourceResult.error;if(!sourceResult.data)throw new MarketDataRoomError('업로드 자료를 찾을 수 없습니다.',404,'SOURCE_NOT_FOUND');
  if(sourceResult.data.storage_path!==completion.storage_path)throw new MarketDataRoomError('저장 경로가 일치하지 않습니다.',400,'STORAGE_PATH_MISMATCH');
  const info=await db.storage.from(STORAGE_BUCKET).info(completion.storage_path);
  if(info.error)throw new MarketDataRoomError('업로드된 파일을 확인하지 못했습니다. 다시 올려주세요.',400,'UPLOAD_NOT_FOUND');
  const actualSize=Number(info.data?.metadata?.size||info.data?.size||sourceResult.data.size_bytes);
  if(actualSize!==Number(sourceResult.data.size_bytes))throw new MarketDataRoomError('업로드된 파일 크기가 선택한 파일과 다릅니다.',400,'UPLOAD_SIZE_MISMATCH');
  const duplicate=await db.from('market_sources').select('id,display_name').eq('project_id',project.id).eq('sha256',completion.sha256).neq('id',id).limit(1).maybeSingle();
  if(duplicate.error)throw duplicate.error;
  if(duplicate.data){await db.storage.from(STORAGE_BUCKET).remove([completion.storage_path]);await db.from('market_sources').delete().eq('id',id).eq('project_id',project.id);throw new MarketDataRoomError(`이미 같은 파일이 있어요: ${duplicate.data.display_name}`,409,'DUPLICATE_SOURCE');}
  let patch={sha256:completion.sha256,uploaded_at:new Date().toISOString(),ingest_status:'REVIEW_REQUIRED',ocr_engine:'MANUAL_REVIEW',ocr_error:null};
  let job={project_id:project.id,source_id:id,job_type:'OCR_REVIEW',status:'WAITING_INPUT',provider:'MANUAL_REVIEW'};
  if(['text/plain','text/markdown'].includes(sourceResult.data.mime_type)){
    const downloaded=await db.storage.from(STORAGE_BUCKET).download(completion.storage_path);
    if(downloaded.error)throw downloaded.error;
    const extracted=new TextDecoder('utf-8',{fatal:false}).decode(await downloaded.data.arrayBuffer()).slice(0,MAX_OCR_CHARS).trim();
    patch={...patch,ocr_text:extracted,ocr_confidence:1,ocr_engine:'TEXT_UTF8'};
    job={...job,job_type:'TEXT_EXTRACT',status:'COMPLETE',provider:'TEXT_UTF8',finished_at:new Date().toISOString()};
  }
  const saved=await db.from('market_sources').update(patch).eq('id',id).eq('project_id',project.id).select(SOURCE_SELECT).single();
  if(saved.error)throw saved.error;
  const queued=await db.from('market_ingestion_jobs').insert(job);if(queued.error)throw queued.error;
  await recordVersion(db,project.id,'SOURCE_UPLOADED',{source_id:id,file_name:saved.data.file_name,mime_type:saved.data.mime_type,size_bytes:Number(saved.data.size_bytes),sha256:saved.data.sha256,ingest_status:saved.data.ingest_status},actor);
  return normalizeSource(saved.data);
}
function validateOcrReview(input={}){
  const text=String(input.ocr_text||'').trim();
  const confidence=Number(input.ocr_confidence);
  const ownerConfirmed=Boolean(input.owner_confirmed);
  if(!text||text.length>MAX_OCR_CHARS)throw new MarketDataRoomError('판독 내용은 1~200,000자로 입력해주세요.');
  if(!Number.isFinite(confidence)||confidence<0||confidence>1)throw new MarketDataRoomError('판독 신뢰도는 0~100% 사이로 입력해주세요.');
  return {ocr_text:text,ocr_confidence:confidence,owner_confirmed:ownerConfirmed};
}
async function saveOcrReview({db,projectId,sourceId,input,actor='OWNER'}){
  const project=await ensureProject(db,projectId),id=requiredSourceId(sourceId),review=validateOcrReview(input);
  const verified=review.owner_confirmed&&review.ocr_confidence>=0.95;
  const saved=await db.from('market_sources').update({...review,ingest_status:verified?'VERIFIED':'REVIEW_REQUIRED',owner_confirmed_at:review.owner_confirmed?new Date().toISOString():null,ocr_error:verified?null:'95% 이상 신뢰도와 사장님 확인이 모두 필요합니다.'}).eq('id',id).eq('project_id',project.id).select(SOURCE_SELECT).maybeSingle();
  if(saved.error)throw saved.error;if(!saved.data)throw new MarketDataRoomError('검수할 자료를 찾을 수 없습니다.',404,'SOURCE_NOT_FOUND');
  await db.from('market_ingestion_jobs').update({status:verified?'COMPLETE':'WAITING_INPUT',finished_at:verified?new Date().toISOString():null,safe_error:verified?null:'OWNER_CONFIRMATION_REQUIRED'}).eq('source_id',id).in('status',['PENDING','RUNNING','WAITING_INPUT']);
  await recordVersion(db,project.id,'SOURCE_OCR_REVIEWED',{source_id:id,ingest_status:saved.data.ingest_status,ocr_confidence:Number(saved.data.ocr_confidence),owner_confirmed:saved.data.owner_confirmed},actor);
  return normalizeSource(saved.data);
}
function validateEvidence(input={}){
  const evidenceType=String(input.evidence_type||'OCR_ESTIMATE').toUpperCase();
  if(!Object.hasOwn(foundation.EVIDENCE_TYPES,evidenceType))throw new MarketDataRoomError('근거 유형을 다시 선택해주세요.');
  const label=String(input.label||'').trim(),valueText=String(input.value_text||'').trim(),unit=String(input.unit||'').trim();
  if(!label||label.length>160)throw new MarketDataRoomError('근거 이름은 1~160자로 입력해주세요.');
  if(!valueText||valueText.length>4000)throw new MarketDataRoomError('근거 값은 1~4,000자로 입력해주세요.');
  const confidence=input.confidence==null||input.confidence===''?null:Number(input.confidence);
  if(confidence!==null&&(!Number.isFinite(confidence)||confidence<0||confidence>1))throw new MarketDataRoomError('근거 신뢰도는 0~100% 사이여야 합니다.');
  const locator=input.source_locator&&typeof input.source_locator==='object'&&!Array.isArray(input.source_locator)?input.source_locator:{};
  return {evidence_type:evidenceType,label,value_text:valueText,unit:unit.slice(0,40)||null,confidence,owner_confirmed:Boolean(input.owner_confirmed),source_locator:locator};
}
async function createEvidence({db,projectId,input,actor='OWNER'}){
  const project=await ensureProject(db,projectId),values=validateEvidence(input);let source=null;
  if(input.source_id){const id=requiredSourceId(input.source_id);const found=await db.from('market_sources').select('id,ingest_status').eq('id',id).eq('project_id',project.id).maybeSingle();if(found.error)throw found.error;if(!found.data)throw new MarketDataRoomError('같은 상품 프로젝트의 출처만 연결할 수 있어요.',400,'SOURCE_PROJECT_MISMATCH');source=found.data;}
  const decision=foundation.evidenceDecision({type:values.evidence_type,source_url:source?`source:${source.id}`:'',confidence:values.confidence,owner_confirmed:values.owner_confirmed,value:values.value_text});
  let status=decision.status;if(source&&source.ingest_status!=='VERIFIED'&&status==='VERIFIED')status='OWNER_CONFIRMATION_REQUIRED';
  const inserted=await db.from('market_evidence').insert({...values,project_id:project.id,source_id:source?.id||null,status,captured_at:new Date().toISOString(),created_by:String(actor||'OWNER').slice(0,160)}).select(EVIDENCE_SELECT).single();
  if(inserted.error)throw inserted.error;
  await recordVersion(db,project.id,'EVIDENCE_CREATED',{evidence_id:inserted.data.id,source_id:inserted.data.source_id,evidence_type:inserted.data.evidence_type,label:inserted.data.label,value_text:inserted.data.value_text,unit:inserted.data.unit,confidence:inserted.data.confidence,status:inserted.data.status},actor);
  return normalizeEvidenceRow(inserted.data);
}
async function confirmEvidence({db,projectId,evidenceId,actor='OWNER'}){
  const project=await ensureProject(db,projectId),id=requiredSourceId(evidenceId,'근거');
  const found=await db.from('market_evidence').select(EVIDENCE_SELECT).eq('id',id).eq('project_id',project.id).maybeSingle();
  if(found.error)throw found.error;if(!found.data)throw new MarketDataRoomError('근거를 찾을 수 없습니다.',404,'EVIDENCE_NOT_FOUND');
  let sourceStatus=null;if(found.data.source_id){const source=await db.from('market_sources').select('ingest_status').eq('id',found.data.source_id).eq('project_id',project.id).maybeSingle();if(source.error)throw source.error;sourceStatus=source.data?.ingest_status||null;}
  const decision=foundation.evidenceDecision({type:found.data.evidence_type,source_url:found.data.source_id?`source:${found.data.source_id}`:'',confidence:found.data.confidence,owner_confirmed:true,value:found.data.value_text});
  const status=sourceStatus&&sourceStatus!=='VERIFIED'?'OWNER_CONFIRMATION_REQUIRED':decision.status;
  const saved=await db.from('market_evidence').update({owner_confirmed:true,status}).eq('id',id).eq('project_id',project.id).select(EVIDENCE_SELECT).single();
  if(saved.error)throw saved.error;
  await recordVersion(db,project.id,'EVIDENCE_CONFIRMED',{evidence_id:saved.data.id,status:saved.data.status,owner_confirmed:true},actor);
  return normalizeEvidenceRow(saved.data);
}
async function createDownloadUrl({db,projectId,sourceId}){
  const project=await ensureProject(db,projectId),id=requiredSourceId(sourceId);
  const found=await db.from('market_sources').select('file_name,storage_bucket,storage_path').eq('id',id).eq('project_id',project.id).maybeSingle();
  if(found.error)throw found.error;if(!found.data?.storage_path)throw new MarketDataRoomError('보관된 원본 파일이 없습니다.',404,'SOURCE_FILE_NOT_FOUND');
  const signed=await db.storage.from(found.data.storage_bucket||STORAGE_BUCKET).createSignedUrl(found.data.storage_path,60,{download:found.data.file_name||true});
  if(signed.error)throw signed.error;return {signed_url:signed.data.signedUrl,expires_in:60};
}

async function loadSourceDetail({db,projectId,sourceId}){
  const project=await ensureProject(db,projectId),id=requiredSourceId(sourceId);
  const found=await db.from('market_sources').select(`${SOURCE_SELECT},ocr_text`).eq('id',id).eq('project_id',project.id).maybeSingle();
  if(found.error)throw found.error;if(!found.data)throw new MarketDataRoomError('자료를 찾을 수 없습니다.',404,'SOURCE_NOT_FOUND');
  return normalizeSource(found.data);
}

module.exports={STORAGE_BUCKET,MAX_SOURCE_BYTES,MAX_OCR_CHARS,ALLOWED_SOURCE_TYPES,MarketDataRoomError,validateSourceMetadata,validateCompletion,validateOcrReview,validateEvidence,loadDataRoom,loadSourceDetail,prepareUpload,completeUpload,saveOcrReview,createEvidence,confirmEvidence,createDownloadUrl};
