'use strict';

const {isIP} = require('node:net');

function canonicalizeTrustedClientIp(value) {
  const version = typeof value === 'string' ? isIP(value) : 0;
  if (version === 0) throw new TypeError('An explicit literal trusted client IP is required.');
  if (version === 4) return value;

  const canonical = new URL(`http://[${value}]/`).hostname.slice(1, -1);
  const mapped = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(canonical);
  if (!mapped) return canonical;
  const high = Number.parseInt(mapped[1], 16);
  const low = Number.parseInt(mapped[2], 16);
  return `${high >>> 8}.${high & 255}.${low >>> 8}.${low & 255}`;
}

module.exports = {canonicalizeTrustedClientIp};
