'use strict';

const { AI_EXPLANATION_SCHEMA, validateExplanation } = require('./schema.js');
const { sanitizeAiInput } = require('./privacy.js');

const DEFAULT_MODEL = 'gpt-5.6-luna';
const RESPONSES_URL = 'https://api.openai.com/v1/responses';

class OpenAiFoundationError extends Error {
  constructor(message, { code = 'OPENAI_REQUEST_FAILED', status = 502 } = {}) {
    super(message);
    this.name = 'OpenAiFoundationError';
    this.code = code;
    this.status = status;
  }
}

function configuration() {
  const vectorStoreId = String(process.env.OPENAI_VECTOR_STORE_ID || '').trim();
  return {
    configured:Boolean(String(process.env.OPENAI_API_KEY || '').trim()),
    execution_enabled:String(process.env.OPENAI_ANALYSIS_ENABLED || '').trim().toLowerCase() === 'true',
    model:String(process.env.OPENAI_MODEL || DEFAULT_MODEL).trim(),
    structured_outputs:true,
    pii_guard:true,
    file_search_configured:Boolean(vectorStoreId),
    vector_store_id:vectorStoreId || null,
    write_actions_enabled:false
  };
}

function buildRequestBody(input, options = {}) {
  const safeInput = sanitizeAiInput(input);
  const cfg = configuration();
  const vectorStoreId = options.useFileSearch === false
    ? ''
    : String(options.vectorStoreId || cfg.vector_store_id || '').trim();
  const body = {
    model:options.model || cfg.model,
    store:false,
    reasoning:{ effort:'low' },
    max_output_tokens:1200,
    instructions:[
      '당신은 하린식품 운영 의사결정 허브의 설명 담당자입니다.',
      '서버가 계산해 제공한 값만 사용하고 새 숫자를 계산하거나 추정하지 마세요.',
      '관찰 → 영향 → 근거 → 추천 순서로 사장님이 이해하기 쉬운 한국어를 사용하세요.',
      '데이터 상태가 BLOCKED 또는 STALE이면 결론을 만들지 말고 판단 보류와 필요한 자료를 안내하세요.',
      '입찰가, 광고예산, 상품, 주문을 직접 변경하거나 변경했다고 말하지 마세요.'
    ].join('\n'),
    input:JSON.stringify(safeInput),
    text:{
      format:{ type:'json_schema', name:'harin_operational_explanation', strict:true, schema:AI_EXPLANATION_SCHEMA },
      verbosity:'low'
    }
  };
  if (vectorStoreId) {
    body.tools=[{ type:'file_search', vector_store_ids:[vectorStoreId], max_num_results:4 }];
    body.include=['file_search_call.results'];
  }
  return body;
}

function outputText(response) {
  if (typeof response?.output_text === 'string' && response.output_text.trim()) return response.output_text;
  for (const item of response?.output || []) {
    if (item.type !== 'message') continue;
    for (const content of item.content || []) if (content.type === 'output_text' && content.text) return content.text;
  }
  return '';
}

async function createStructuredExplanation(input, options = {}) {
  const cfg = configuration();
  if (!cfg.execution_enabled) throw new OpenAiFoundationError('AI 자동분석은 아직 사용 전입니다. 크레딧 연결 후 운영 설정에서 켜주세요.', { code:'AI_EXECUTION_DISABLED', status:503 });
  if (!cfg.configured) throw new OpenAiFoundationError('OpenAI 서버 키가 설정되지 않았습니다.', { code:'OPENAI_NOT_CONFIGURED', status:503 });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(options.timeoutMs || 45000));
  try {
    const headers = { 'content-type':'application/json', authorization:`Bearer ${process.env.OPENAI_API_KEY}` };
    if (process.env.OPENAI_ORGANIZATION) headers['OpenAI-Organization']=process.env.OPENAI_ORGANIZATION;
    if (process.env.OPENAI_PROJECT) headers['OpenAI-Project']=process.env.OPENAI_PROJECT;
    const response = await (options.fetchImpl || fetch)(RESPONSES_URL, {
      method:'POST', headers, body:JSON.stringify(buildRequestBody(input, options)), signal:controller.signal
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const code = String(data?.error?.code || data?.error?.type || `HTTP_${response.status}`).slice(0, 80);
      const message = code === 'insufficient_quota'
        ? 'OpenAI 프로젝트의 API 사용 한도 또는 결제 크레딧을 확인해주세요.'
        : `OpenAI 응답을 받지 못했습니다. (${code})`;
      throw new OpenAiFoundationError(message, { code, status:response.status === 429 ? 429 : 502 });
    }
    const text = outputText(data);
    if (!text) throw new OpenAiFoundationError('OpenAI 응답에 설명 결과가 없습니다.', { code:'EMPTY_OUTPUT' });
    let parsed;
    try { parsed=JSON.parse(text); }
    catch { throw new OpenAiFoundationError('OpenAI 구조화 결과를 해석하지 못했습니다.', { code:'INVALID_STRUCTURED_OUTPUT' }); }
    return { response_id:data.id || null, model:data.model || cfg.model, result:validateExplanation(parsed), usage:data.usage || null };
  } catch (error) {
    if (error?.name === 'AbortError') throw new OpenAiFoundationError('OpenAI 응답 시간이 초과됐습니다.', { code:'OPENAI_TIMEOUT', status:504 });
    throw error;
  } finally { clearTimeout(timeout); }
}

module.exports = { DEFAULT_MODEL, OpenAiFoundationError, buildRequestBody, configuration, createStructuredExplanation, outputText };
