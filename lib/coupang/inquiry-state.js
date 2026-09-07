'use strict';

const text = value => value == null ? '' : String(value).trim();
const lower = value => text(value).toLowerCase();
function booleanValue(value) {
  if (value === true || value === 1 || lower(value) === 'true') return true;
  if (value === false || value === 0 || lower(value) === 'false') return false;
  return null;
}

function orderedReplies(item = {}) {
  return (Array.isArray(item.replies) ? item.replies : []).map((reply, index) => ({ reply, index }))
    .sort((a, b) => (Date.parse(a.reply.replyAt) || 0) - (Date.parse(b.reply.replyAt) || 0) || a.index - b.index)
    .map(entry => entry.reply);
}

function inquiryState(item = {}, type = 'ONLINE') {
  const status = lower(item.inquiryStatus ?? item.status ?? item.answeredType);
  if (type !== 'CALL_CENTER') {
    const explicit = booleanValue(item.answered);
    const negative = ['noanswer', 'unanswered', 'waiting', 'pending'].includes(status);
    const hasReply = Array.isArray(item.commentDtoList) && item.commentDtoList.length > 0;
    const answered = explicit ?? (!negative && (['answered', 'answer', 'complete', 'completed', 'done', 'closed'].includes(status) || hasReply));
    return { answered, completed: answered, replyRequired: !answered, confirmationRequired: false,
      parentAnswerId: text(item.parentAnswerId ?? item.answerId ?? item.transferAnswerId) || null, canReply: !answered };
  }
  const counselingStatus = lower(item.csPartnerCounselingStatus);
  const replies = orderedReplies(item);
  const transfers = replies.filter(reply => ['requestanswer', 'answered'].includes(lower(reply.partnerTransferStatus)));
  const latest = transfers.at(-1);
  const completed = ['complete', 'completed', 'closed'].includes(status);
  const replied = latest && replies.some(reply => lower(reply.answerType) === 'vendor' &&
    text(reply.parentAnswerId) === text(latest.answerId) && replies.indexOf(reply) > replies.indexOf(latest));
  const pending = !replied && counselingStatus === 'requestanswer' && lower(latest?.partnerTransferStatus) === 'requestanswer';
  const confirmationRequired = status === 'progress' && pending && lower(latest?.answerType) === 'csagent' && booleanValue(latest?.needAnswer) === false;
  const replyRequired = status === 'progress' && pending && lower(latest?.answerType) === 'csagent' && booleanValue(latest?.needAnswer) === true;
  const parentAnswerId = replyRequired && /^\d+$/.test(text(latest?.answerId)) ? text(latest.answerId) : null;
  const answered = confirmationRequired ? false : Boolean(replied) || completed || counselingStatus === 'answered' ||
    (lower(latest?.partnerTransferStatus) === 'answered');
  return { answered, completed, replyRequired, confirmationRequired, parentAnswerId,
    canReply: replyRequired && Boolean(parentAnswerId) };
}

module.exports = { booleanValue, orderedReplies, inquiryState };
