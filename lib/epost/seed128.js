'use strict';

const { KISA_SEED_CBC } = require('kisa-seed');

const BLOCK_SIZE = 16;
const STANDARD_VECTOR = Object.freeze({
  key: '00000000000000000000000000000000',
  plaintext: '000102030405060708090a0b0c0d0e0f',
  ciphertext: '5ebac6e0054e166819aff1cc6d346cdb'
});

function bytes(value, encoding = 'utf8') {
  if (Buffer.isBuffer(value)) return Buffer.from(value);
  if (value instanceof Uint8Array) return Buffer.from(value);
  return Buffer.from(String(value ?? ''), encoding);
}

function keyBytes(value) {
  const key = bytes(value);
  if (key.length !== BLOCK_SIZE) {
    throw Object.assign(new Error('우체국 SEED 보안키는 UTF-8 기준 16바이트여야 합니다.'), {
      code: 'EPOST_INVALID_SEED_KEY'
    });
  }
  return key;
}

function zeroPad(value) {
  const input = bytes(value);
  const blocks = Math.max(1, Math.ceil(input.length / BLOCK_SIZE));
  const output = Buffer.alloc(blocks * BLOCK_SIZE);
  input.copy(output);
  return output;
}

function encryptBlock(key, block) {
  const encrypted = KISA_SEED_CBC.SEED_CBC_Encrypt(
    Uint8Array.from(key),
    new Uint8Array(BLOCK_SIZE),
    Uint8Array.from(block),
    0,
    BLOCK_SIZE
  );
  // A one-block CBC encryption with an all-zero IV has the same first block
  // as SEED-128 ECB. The package appends PKCS padding, so only that first
  // block is used; ePost's required zero padding is applied by zeroPad().
  return Buffer.from(encrypted).subarray(0, BLOCK_SIZE);
}

function encryptEcbZeroPadded(keyValue, value) {
  const key = keyBytes(keyValue);
  const padded = zeroPad(value);
  const output = Buffer.alloc(padded.length);
  for (let offset = 0; offset < padded.length; offset += BLOCK_SIZE) {
    encryptBlock(key, padded.subarray(offset, offset + BLOCK_SIZE)).copy(output, offset);
  }
  return output;
}

function encryptRegData(securityKey, plainText) {
  return encryptEcbZeroPadded(securityKey, Buffer.from(String(plainText ?? ''), 'utf8')).toString('hex');
}

function selfTest() {
  const actual = encryptEcbZeroPadded(
    Buffer.from(STANDARD_VECTOR.key, 'hex'),
    Buffer.from(STANDARD_VECTOR.plaintext, 'hex')
  ).toString('hex');
  return { ok: actual === STANDARD_VECTOR.ciphertext, vector: 'KISA-SEED-128-ECB' };
}

module.exports = { BLOCK_SIZE, STANDARD_VECTOR, encryptEcbZeroPadded, encryptRegData, keyBytes, selfTest, zeroPad };
