'use strict';

const {createAuthRequestLimit} = require('./auth-request-limit.js');

const ACCOUNT_USER_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function normalizeAccountUserId(userId) {
  if (typeof userId !== 'string' || !ACCOUNT_USER_ID.test(userId)) {
    throw new TypeError('A canonical account user ID is required.');
  }
  return userId.toLowerCase();
}

function createAccountLoginLimit(options) {
  const requestLimit = createAuthRequestLimit(options);
  return async function accountLimit(input = {}) {
    const userId = normalizeAccountUserId(input?.userId);
    return requestLimit({kind: 'LOGIN', subject: `ACCOUNT:${userId}`});
  };
}

module.exports = {createAccountLoginLimit};
