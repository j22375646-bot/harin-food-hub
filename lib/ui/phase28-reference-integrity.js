'use strict';

const crypto=require('node:crypto');
const path=require('node:path');

const TEXT_EXTENSIONS=new Set(['.css','.html','.js','.json','.md','.txt']);

function canonicalizeReferenceBuffer(relativePath,buffer){
  if(!Buffer.isBuffer(buffer))throw new TypeError('기준 파일은 Buffer로 검증해야 합니다.');
  if(!TEXT_EXTENSIONS.has(path.extname(relativePath).toLowerCase()))return buffer;
  return Buffer.from(buffer.toString('utf8').replace(/\r\n?/g,'\n'),'utf8');
}

function fingerprintReference(relativePath,buffer){
  const canonical=canonicalizeReferenceBuffer(relativePath,buffer);
  return {
    bytes:canonical.byteLength,
    sha256:crypto.createHash('sha256').update(canonical).digest('hex')
  };
}

module.exports={canonicalizeReferenceBuffer,fingerprintReference};
