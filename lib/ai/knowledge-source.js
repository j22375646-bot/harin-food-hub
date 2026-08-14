'use strict';

const STORAGE_BUCKET='ai-knowledge-private';
const MAX_SOURCE_BYTES=20*1024*1024;
const ALLOWED_SOURCE_TYPES=Object.freeze({
  '.pdf':'application/pdf',
  '.docx':'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.txt':'text/plain',
  '.md':'text/markdown'
});

function safeFileName(value) {
  const name=String(value||'').trim().replace(/[\\/]/g,'_').replace(/[\u0000-\u001f\u007f]/g,'').slice(0,180);
  if(!name||name.startsWith('.'))throw new Error('원본 파일 이름을 확인해주세요.');
  return name;
}

function extension(name) {
  const match=String(name).toLowerCase().match(/\.[a-z0-9]+$/);
  return match?match[0]:'';
}

function validateSourceMetadata(input = {}) {
  const fileName=safeFileName(input.file_name);
  const ext=extension(fileName);
  const expected=ALLOWED_SOURCE_TYPES[ext];
  if(!expected)throw new Error('PDF, DOCX, TXT, MD 파일만 보관할 수 있습니다.');
  const size=Number(input.size_bytes);
  if(!Number.isSafeInteger(size)||size<1||size>MAX_SOURCE_BYTES)throw new Error('원본 파일은 20MB 이하만 보관할 수 있습니다.');
  const mime=String(input.mime_type||expected).trim().toLowerCase();
  const accepted=new Set([expected,'application/octet-stream',ext==='.md'?'text/plain':'']);
  if(!accepted.has(mime))throw new Error('파일 확장자와 형식이 일치하지 않습니다.');
  return { file_name:fileName, extension:ext, mime_type:expected, size_bytes:size };
}

function storagePath(documentId, fileName, stamp = Date.now()) {
  const id=String(documentId||'').toLowerCase();
  if(!/^[0-9a-f-]{36}$/.test(id))throw new Error('자료 식별자를 확인해주세요.');
  const ext=extension(fileName);
  return `${id}/${stamp}-${String(fileName).normalize('NFKD').replace(/[^a-zA-Z0-9._-]+/g,'-').replace(/^-+|-+$/g,'').slice(0,100) || `source${ext}`}`;
}

function validateCompletion(input = {}, documentId) {
  const metadata=validateSourceMetadata(input);
  const path=String(input.storage_path||'').trim();
  if(!path.startsWith(`${String(documentId).toLowerCase()}/`)||path.includes('..'))throw new Error('원본 저장 경로를 확인해주세요.');
  const sha256=String(input.sha256||'').trim().toLowerCase();
  if(!/^[a-f0-9]{64}$/.test(sha256))throw new Error('원본 파일 확인값을 다시 계산해주세요.');
  return {...metadata,storage_path:path,sha256};
}

function storedPatch(metadata) {
  const now=new Date().toISOString();
  return {
    source_type:'FILE', source_label:metadata.file_name, source_status:'STORED',
    source_storage_bucket:STORAGE_BUCKET, source_storage_path:metadata.storage_path,
    source_file_name:metadata.file_name, source_mime_type:metadata.mime_type,
    source_size_bytes:metadata.size_bytes, source_sha256:metadata.sha256,
    source_uploaded_at:now, privacy_status:'REVIEW_REQUIRED', status:'DRAFT',
    approved_by:null, approved_at:null, openai_file_id:null, vector_store_file_id:null,
    vector_status:'NOT_CONNECTED', updated_at:now
  };
}

module.exports={ STORAGE_BUCKET, MAX_SOURCE_BYTES, ALLOWED_SOURCE_TYPES, safeFileName, validateSourceMetadata, storagePath, validateCompletion, storedPatch };
