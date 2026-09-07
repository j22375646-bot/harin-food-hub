'use strict';

// Server/worker only: keep the existing encrypted queue format and never pass the envelope to a client.
const { seal, open } = require('./operation-queue.js');
const { inquiryState, orderedReplies } = require('./inquiry-state.js');
const text = value => value == null ? '' : String(value);

function encryptInquiryThread(item, options = {}) {
  const conversation = orderedReplies(item).map(reply => ({
    answerId: text(reply.answerId), parentAnswerId: text(reply.parentAnswerId) || null,
    answerType: text(reply.answerType), partnerTransferStatus: text(reply.partnerTransferStatus),
    needAnswer: reply.needAnswer === true, replyAt: reply.replyAt || null, content: text(reply.content),
  }));
  return seal({ content: text(item.content ?? item.question ?? item.inquiryContent), conversation }, options.secret);
}

function hydrateInquiry(row, options = {}) {
  const { raw_data: raw = {}, ...safe } = row;
  if (row.inquiry_type !== 'CALL_CENTER') return safe;
  const state = inquiryState({ ...raw, inquiryStatus: raw.inquiryStatus ?? row.status }, 'CALL_CENTER');
  let thread = null;
  let verificationError = raw.cs_sync?.verified === false ? '문의 상태를 다시 확인해야 합니다.' : null;
  try {
    if (raw.cs_thread_encrypted) thread = open(raw.cs_thread_encrypted, options.secret);
  } catch {
    verificationError = '상담 내용을 복원하지 못했습니다. 재수집이 필요합니다.';
  }
  const conversation = Array.isArray(thread?.conversation) ? thread.conversation : [];
  const current = conversation.find(reply => reply.answerId === state.parentAnswerId);
  const content = current?.content || [...conversation].reverse().find(reply => reply.content)?.content || thread?.content;
  const verified = !verificationError && raw.cs_sync?.verified === true;
  const hasStatusEvidence = Boolean(raw.inquiryStatus || raw.csPartnerCounselingStatus);
  return { ...safe, answered: hasStatusEvidence ? state.answered : safe.answered, parent_answer_id: state.parentAnswerId,
    question_text: content || safe.question_text || '상담 원문 재수집이 필요합니다.', conversation,
    reply_required: state.replyRequired, confirmation_required: state.confirmationRequired,
    can_reply: verified && state.canReply && Boolean(current?.content), status_verified: verified,
    verification_error: verificationError || (!thread ? '상담 원문 재수집이 필요합니다.' : null),
    fetched_at: raw.cs_sync?.verifiedAt || null,
  };
}

module.exports = { encryptInquiryThread, hydrateInquiry, inquiryState };
