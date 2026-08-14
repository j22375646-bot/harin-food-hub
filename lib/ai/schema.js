'use strict';

const AI_EXPLANATION_SCHEMA = Object.freeze({
  type:'object',
  additionalProperties:false,
  properties:{
    decision_status:{ type:'string', enum:['READY','WATCH','BLOCKED'] },
    observation:{ type:'string', minLength:1, maxLength:500 },
    impact:{ type:'string', minLength:1, maxLength:500 },
    evidence:{ type:'array', minItems:1, maxItems:5, items:{ type:'string', minLength:1, maxLength:300 } },
    recommendation:{ type:'string', minLength:1, maxLength:500 },
    confidence:{ type:'string', enum:['HIGH','MEDIUM','LOW'] },
    caution:{ type:'string', minLength:1, maxLength:500 }
  },
  required:['decision_status','observation','impact','evidence','recommendation','confidence','caution']
});

function validateExplanation(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('AI 결과가 객체 형식이 아닙니다.');
  const required = AI_EXPLANATION_SCHEMA.required;
  for (const key of required) if (!(key in value)) throw new Error(`AI 결과에 ${key} 항목이 없습니다.`);
  if (!['READY','WATCH','BLOCKED'].includes(value.decision_status)) throw new Error('AI 판단 상태가 올바르지 않습니다.');
  if (!['HIGH','MEDIUM','LOW'].includes(value.confidence)) throw new Error('AI 신뢰도 값이 올바르지 않습니다.');
  if (!Array.isArray(value.evidence) || !value.evidence.length || value.evidence.length > 5) throw new Error('AI 근거 목록이 올바르지 않습니다.');
  for (const key of ['observation','impact','recommendation','caution']) {
    if (!String(value[key] || '').trim()) throw new Error(`AI 결과의 ${key} 내용이 비어 있습니다.`);
  }
  return value;
}

module.exports = { AI_EXPLANATION_SCHEMA, validateExplanation };
