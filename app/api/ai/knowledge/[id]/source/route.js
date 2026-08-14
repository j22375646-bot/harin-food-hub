import authModule from '../../../../../../lib/dashboard-auth.js';
import apiSafety from '../../../../../../lib/api/safety.js';
import supabaseModule from '../../../../../../lib/cafe24/supabase.js';
import knowledgeSource from '../../../../../../lib/ai/knowledge-source.js';

export const runtime='nodejs';
export const dynamic='force-dynamic';

function owner(request) {
  const token=apiSafety.cookieValue(request,authModule.COOKIE_NAME);
  const session=authModule.parseSession(token);
  return session&&authModule.roleAtLeast(session,'OWNER')?session:null;
}

async function documentId(context) {
  const params=await context.params;
  const id=String(params?.id||'').trim().toLowerCase();
  return /^[0-9a-f-]{36}$/.test(id)?id:null;
}

async function ensurePrivateBucket(db) {
  const found=await db.storage.getBucket(knowledgeSource.STORAGE_BUCKET);
  if(found.data){
    if(found.data.public)throw new Error('AI 기준자료 저장소가 공개 상태입니다. 업로드를 중지했습니다.');
    return;
  }
  const missing=found.error&&(Number(found.error.status)===404||/not found|does not exist/i.test(String(found.error.message)));
  if(found.error&&!missing)throw found.error;
  const created=await db.storage.createBucket(knowledgeSource.STORAGE_BUCKET,{
    public:false,
    fileSizeLimit:knowledgeSource.MAX_SOURCE_BYTES,
    allowedMimeTypes:Object.values(knowledgeSource.ALLOWED_SOURCE_TYPES)
  });
  if(created.error&&!/already exists|duplicate/i.test(String(created.error.message)))throw created.error;
}

async function findDocument(db,id) {
  const found=await db.from('ai_knowledge_documents')
    .select('id,source_status,source_storage_bucket,source_storage_path,source_file_name')
    .eq('id',id).maybeSingle();
  if(found.error)throw found.error;
  return found.data;
}

function failure(error,status=400) {
  console.error('[ai knowledge source]',error);
  return apiSafety.json({ok:false,error:String(error?.message||'원본 파일 처리 실패'),code:'KNOWLEDGE_SOURCE_FAILED'},{status});
}

export async function POST(request,context) {
  if(!owner(request))return apiSafety.unauthorized();
  const id=await documentId(context);
  if(!id)return apiSafety.json({ok:false,error:'자료 식별자를 확인해주세요.'},{status:400});
  try {
    const body=await apiSafety.readJson(request,{maxBytes:8*1024});
    const metadata=knowledgeSource.validateSourceMetadata(body);
    const db=supabaseModule.getSupabase();
    const document=await findDocument(db,id);
    if(!document)return apiSafety.json({ok:false,error:'기준자료를 찾을 수 없습니다.'},{status:404});
    await ensurePrivateBucket(db);
    const storagePath=knowledgeSource.storagePath(id,metadata.file_name);
    const signed=await db.storage.from(knowledgeSource.STORAGE_BUCKET).createSignedUploadUrl(storagePath);
    if(signed.error)throw signed.error;
    const pending=await db.from('ai_knowledge_documents').update({
      source_status:'UPLOAD_PENDING', source_file_name:metadata.file_name,
      source_mime_type:metadata.mime_type, source_size_bytes:metadata.size_bytes,
      updated_at:new Date().toISOString()
    }).eq('id',id);
    if(pending.error)throw pending.error;
    return apiSafety.json({
      ok:true, upload:{ signed_url:signed.data.signedUrl, storage_path:storagePath,
        file_name:metadata.file_name, mime_type:metadata.mime_type, size_bytes:metadata.size_bytes }
    });
  } catch(error){return failure(error);}
}

export async function PATCH(request,context) {
  const session=owner(request);
  if(!session)return apiSafety.unauthorized();
  const id=await documentId(context);
  if(!id)return apiSafety.json({ok:false,error:'자료 식별자를 확인해주세요.'},{status:400});
  try {
    const body=await apiSafety.readJson(request,{maxBytes:12*1024});
    const metadata=knowledgeSource.validateCompletion(body,id);
    const db=supabaseModule.getSupabase();
    const document=await findDocument(db,id);
    if(!document)return apiSafety.json({ok:false,error:'기준자료를 찾을 수 없습니다.'},{status:404});
    const info=await db.storage.from(knowledgeSource.STORAGE_BUCKET).info(metadata.storage_path);
    if(info.error)throw new Error('업로드된 원본을 확인하지 못했습니다. 다시 업로드해주세요.');
    const actualSize=Number(info.data?.metadata?.size||info.data?.size||metadata.size_bytes);
    if(actualSize!==metadata.size_bytes)throw new Error('업로드된 원본 크기가 선택한 파일과 다릅니다.');
    const patch=knowledgeSource.storedPatch(metadata);
    const saved=await db.from('ai_knowledge_documents').update(patch).eq('id',id)
      .select('id,source_status,source_file_name,source_mime_type,source_size_bytes,source_sha256,source_uploaded_at,privacy_status,status,vector_status').single();
    if(saved.error)throw saved.error;
    if(document.source_storage_path&&document.source_storage_path!==metadata.storage_path){
      await db.storage.from(document.source_storage_bucket||knowledgeSource.STORAGE_BUCKET).remove([document.source_storage_path]);
    }
    return apiSafety.json({ok:true,item:saved.data,message:'원본을 비공개 보관했습니다. 개인정보 검수를 다시 완료해주세요.'});
  } catch(error){return failure(error);}
}

export async function GET(request,context) {
  if(!owner(request))return apiSafety.unauthorized();
  const id=await documentId(context);
  if(!id)return apiSafety.json({ok:false,error:'자료 식별자를 확인해주세요.'},{status:400});
  try {
    const db=supabaseModule.getSupabase();
    const document=await findDocument(db,id);
    if(!document?.source_storage_path)return apiSafety.json({ok:false,error:'보관된 원본 파일이 없습니다.'},{status:404});
    const signed=await db.storage.from(document.source_storage_bucket||knowledgeSource.STORAGE_BUCKET)
      .createSignedUrl(document.source_storage_path,60,{download:document.source_file_name||true});
    if(signed.error)throw signed.error;
    return apiSafety.json({ok:true,signed_url:signed.data.signedUrl,expires_in:60});
  } catch(error){return failure(error);}
}
