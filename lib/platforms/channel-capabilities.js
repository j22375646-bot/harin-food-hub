'use strict';

const cafe24TokenStore = require('../cafe24/token-store.js');

const CAPABILITIES = [
  ['products','상품'],
  ['orders','주문·배송'],
  ['inquiries','문의'],
  ['claims','취소·반품·교환']
];

const CAFE_SCOPES = {
  products:{ read:'mall.read_product', write:'mall.write_product' },
  orders:{ read:'mall.read_order', write:'mall.write_order' },
  inquiries:{ read:'mall.read_community', write:'mall.write_community' },
  claims:{ read:'mall.read_order', write:'mall.write_order' }
};

const state = (status, label, reason) => ({ status, label, reason });
const ready = reason => state('READY', '가능', reason);
const locked = reason => state('LOCKED', '잠금', reason);
const reconnect = reason => state('RECONNECT_REQUIRED', '재연결 필요', reason);
const setup = reason => state('SETUP_REQUIRED', '설정 필요', reason);
const verify = reason => state('VERIFY_REQUIRED', '확인 필요', reason);

function scopesFromToken(token) {
  const source = token?.scopes || token?.scope || [];
  return new Set((Array.isArray(source) ? source : String(source).split(/[\s,]+/)).filter(Boolean));
}

function latest(syncs, platform, jobType) {
  return (syncs || []).find(item => item.platform === platform && (!jobType || item.job_type === jobType));
}

function capabilityRows(factory) {
  return CAPABILITIES.map(([key,label]) => ({ key, label, ...factory(key) }));
}

function naverChannel(syncs) {
  const probe = latest(syncs, 'NAVER', 'COMMERCE_CONNECTION_TEST');
  const meta = probe?.metadata || {};
  const configured = Boolean(probe) && meta.code !== 'NAVER_COMMERCE_CONFIG_REQUIRED';
  const capabilities = capabilityRows(key => {
    if (!configured) return { read:setup('서울 고정 IP 서버에 네이버 커머스 API 키를 등록한 뒤 연결 확인을 실행하세요.'), write:locked('읽기 연결이 확인되기 전에는 변경할 수 없습니다.') };
    const item = meta.capabilities?.[key] || {};
    const read = item.read ? ready('커머스 API 읽기 요청이 성공했습니다.') : verify(meta.failures?.find(value => value.key?.includes(key === 'products' ? 'products' : key === 'inquiries' ? 'qnas' : 'product-orders'))?.error || '최근 연결 확인에서 이 자료를 읽지 못했습니다.');
    const write = !item.read ? locked('읽기 성공이 먼저 필요합니다.') : item.write ? ready('쓰기 환경 잠금이 해제되어 있습니다.') : locked('읽기는 가능하지만 실제 변경 환경 잠금은 유지 중입니다.');
    return { read, write };
  });
  const readCount = capabilities.filter(item => item.read.status === 'READY').length;
  return {
    platform:'NAVER', name:'네이버 스마트스토어', service:'커머스 API · 광고 API와 분리',
    status:!configured ? 'SETUP_REQUIRED' : readCount === CAPABILITIES.length ? 'READ_READY' : probe.status === 'FAILED' ? 'FAILED' : 'VERIFY_REQUIRED',
    summary:!configured ? '커머스 API 키 등록 필요' : readCount === CAPABILITIES.length ? '상품·주문·문의·클레임 조회 확인' : '일부 조회 권한 확인 필요',
    lastVerifiedAt:probe?.finished_at || meta.verifiedAt || null,
    action:{ type:'probe', label:'네이버 커머스 연결 확인' },
    capabilities
  };
}

function cafe24Channel(syncs, token, counts = {}) {
  const scopes = scopesFromToken(token);
  const connected = Boolean(token?.access_token);
  const sync = latest(syncs, 'CAFE24', 'FETCH_ALL');
  const readSucceeded = ['SUCCESS','PARTIAL'].includes(sync?.status);
  const missing = [...new Set(Object.values(CAFE_SCOPES).flatMap(value => [value.read,value.write]).filter(scope => !scopes.has(scope)))];
  const capabilities = capabilityRows(key => {
    const required = CAFE_SCOPES[key];
    const hasRead = scopes.has(required.read);
    const hasWrite = scopes.has(required.write);
    let read;
    if (!connected) read = setup('Cafe24 OAuth 연결이 필요합니다.');
    else if (!hasRead) read = reconnect(`${required.read} 권한을 새로 승인해야 합니다.`);
    else if (!readSucceeded && ['products','orders','claims'].includes(key)) read = verify('권한은 있지만 최근 조회 성공 기록이 없습니다.');
    else read = ready(key === 'inquiries' ? '문의 읽기 권한이 토큰에 포함되어 있습니다.' : '최근 Cafe24 조회가 성공했습니다.');
    let write;
    if (read.status !== 'READY') write = locked('읽기 성공이 먼저 필요합니다.');
    else if (!hasWrite) write = reconnect(`${required.write} 권한을 새로 승인해야 합니다.`);
    else write = ready('쓰기 권한이 있으며 실제 변경 화면은 승인 절차를 거쳐 열립니다.');
    return { read, write };
  });
  return {
    platform:'CAFE24', name:'Cafe24 자사몰', service:'Admin API · OAuth',
    status:!connected ? 'SETUP_REQUIRED' : missing.length ? 'RECONNECT_REQUIRED' : readSucceeded ? 'WRITE_READY' : 'VERIFY_REQUIRED',
    summary:!connected ? 'OAuth 연결 필요' : missing.length ? `새 권한 ${missing.length}개 재승인 필요` : '상품·주문·문의 권한 준비됨',
    lastVerifiedAt:sync?.finished_at || token?.saved_at || null,
    action:{ type:'reconnect', label:missing.length ? 'Cafe24 권한 다시 연결' : 'Cafe24 연결 갱신' },
    counts,
    missingScopes:missing,
    capabilities
  };
}

function coupangChannel(syncs, counts = {}) {
  const sync = latest(syncs, 'COUPANG', 'FETCH_ALL');
  const meta = sync?.metadata || {};
  const successful = ['SUCCESS','PARTIAL'].includes(sync?.status);
  const productRead = successful && Number(counts.products || 0) > 0;
  const datasetReady = {
    products:productRead,
    orders:successful && Number(counts.orders || 0) >= 0,
    inquiries:successful && meta.counts && Object.hasOwn(meta.counts, 'inquiries'),
    claims:successful && meta.counts && (Object.hasOwn(meta.counts, 'returns') || Object.hasOwn(meta.counts, 'exchanges'))
  };
  const productWriteEnabled = Boolean(meta.productWriteEnabled);
  const capabilities = capabilityRows(key => {
    const read = datasetReady[key] ? ready('서울 고정 IP 서버의 조회 기록이 있습니다.') : verify('고정 IP 전체 수집을 실행해 조회 권한을 확인하세요.');
    const write = read.status !== 'READY' ? locked('읽기 성공이 먼저 필요합니다.') : key === 'products'
      ? productWriteEnabled ? ready('상품 변경 API가 고정 IP 서버에서 열려 있습니다.') : locked('상품 변경 API 연결은 완료됐고 환경 잠금은 유지 중입니다.')
      : ready('기존 고정 IP 주문·CS 처리 경로를 사용합니다.');
    return { read, write };
  });
  return {
    platform:'COUPANG', name:'쿠팡 WING', service:'Open API · 서울 고정 IP 13.124.12.17',
    status:successful && productRead ? 'READ_READY' : sync?.status === 'FAILED' ? 'FAILED' : 'VERIFY_REQUIRED',
    summary:successful && productRead ? '고정 IP 상품·운영 조회 연결됨' : '고정 IP 수집 확인 필요',
    lastVerifiedAt:sync?.finished_at || null,
    action:{ type:'coupangProbe', label:'쿠팡 고정 IP 다시 확인' },
    counts,
    capabilities
  };
}

async function buildChannelCapabilities({ syncs = [], cafe24Token, cafe24Counts = {}, coupangCounts = {} } = {}) {
  let token = cafe24Token;
  if (token === undefined) {
    try { token = await cafe24TokenStore.readToken(); } catch { token = null; }
  }
  return {
    phase:'11-1',
    title:'채널 연결·권한 확장',
    rule:'읽기 성공 전에는 쓰기 기능을 열지 않습니다.',
    channels:[naverChannel(syncs), cafe24Channel(syncs, token, cafe24Counts), coupangChannel(syncs, coupangCounts)]
  };
}

module.exports = { CAPABILITIES, CAFE_SCOPES, scopesFromToken, naverChannel, cafe24Channel, coupangChannel, buildChannelCapabilities };
