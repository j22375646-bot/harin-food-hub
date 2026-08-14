'use strict';

const PRIVATE_KEY_PATTERN = /(name|customer|buyer|recipient|receiver|phone|mobile|tel|email|address|zipcode|postal|order[_-]?id|shipment|invoice|memo)/i;
const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
const PHONE_PATTERN = /(?:^|\D)(?:01[016789]|0\d{1,2})[- .]?\d{3,4}[- .]?\d{4}(?:\D|$)/;
const KOREAN_ADDRESS_PATTERN = /(?:도로명|로|길|동|읍|면|리)\s*\d{1,4}(?:[- ]\d{1,4})?.*(?:호|층|동)?/;

class PiiBlockedError extends Error {
  constructor(path, reason) {
    super(`AI 입력에서 개인정보 가능성이 감지되었습니다. (${path}: ${reason})`);
    this.name = 'PiiBlockedError';
    this.code = 'PII_BLOCKED';
    this.status = 400;
  }
}

function assertNoPii(value, path = 'root') {
  if (value == null || typeof value === 'number' || typeof value === 'boolean') return true;
  if (typeof value === 'string') {
    if (EMAIL_PATTERN.test(value)) throw new PiiBlockedError(path, '이메일');
    if (PHONE_PATTERN.test(value)) throw new PiiBlockedError(path, '연락처');
    if (KOREAN_ADDRESS_PATTERN.test(value)) throw new PiiBlockedError(path, '주소');
    return true;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoPii(item, `${path}[${index}]`));
    return true;
  }
  if (typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      if (PRIVATE_KEY_PATTERN.test(key)) throw new PiiBlockedError(`${path}.${key}`, '금지된 필드');
      assertNoPii(item, `${path}.${key}`);
    }
  }
  return true;
}

function sanitizeText(value, maxLength = 500) {
  return String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function sanitizeAiInput(payload) {
  const cloned = JSON.parse(JSON.stringify(payload ?? {}));
  assertNoPii(cloned);
  return cloned;
}

module.exports = { PiiBlockedError, assertNoPii, sanitizeAiInput, sanitizeText };
