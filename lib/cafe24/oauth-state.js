'use strict';
const crypto = require('node:crypto');

function createState(secret) {
  const value = `${Date.now()}.${crypto.randomBytes(16).toString('hex')}`;
  const signature = crypto.createHmac('sha256', secret).update(value).digest('hex');
  return `${value}.${signature}`;
}

function validState(state, secret) {
  if (typeof state !== 'string') return false;
  const parts = state.split('.');
  if (parts.length !== 3 || Date.now() - Number(parts[0]) > 10 * 60 * 1000) return false;
  const value = `${parts[0]}.${parts[1]}`;
  const expected = crypto.createHmac('sha256', secret).update(value).digest('hex');
  const actual = Buffer.from(parts[2]);
  return actual.length === expected.length && crypto.timingSafeEqual(actual, Buffer.from(expected));
}

module.exports = { createState, validState };
