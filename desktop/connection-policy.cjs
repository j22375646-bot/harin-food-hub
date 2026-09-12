'use strict';

const APP_ENTRY_URL = 'moaon://app/index.html';
const HARIN_ORIGIN = 'https://harin-cafe24-sync.vercel.app';
const LOGIN_URL = `${HARIN_ORIGIN}/login`;
const ORDER_SCOPES = Object.freeze(['ACTIVE', 'REGISTER', 'IN_TRANSIT', 'COMPLETED']);
const ORDER_SCOPE_SET = new Set(ORDER_SCOPES);
const ORDER_CHANNELS = Object.freeze(['ALL','CAFE24','NAVER','COUPANG']);
// Keep legacy storage bound to Harin until independent business storage exists.
const ORDERS_PATH = `${HARIN_ORIGIN}/api/moaon/businesses/a3452bca-e259-40ed-a93d-b8bcc5c1b9e0/orders?stage=`;
const ORDERS_URL = `${ORDERS_PATH}ACTIVE&platform=ALL`;
const FINANCE_URL = `${HARIN_ORIGIN}/api/moaon/businesses/a3452bca-e259-40ed-a93d-b8bcc5c1b9e0/finance`;
const SETTLEMENT_URL = `${HARIN_ORIGIN}/api/moaon/businesses/a3452bca-e259-40ed-a93d-b8bcc5c1b9e0/settlement`;
const CS_URL = `${HARIN_ORIGIN}/api/moaon/businesses/a3452bca-e259-40ed-a93d-b8bcc5c1b9e0/cs`;
const INVENTORY_URL = `${HARIN_ORIGIN}/api/moaon/businesses/a3452bca-e259-40ed-a93d-b8bcc5c1b9e0/inventory`;
const INSIGHTS_URL = `${HARIN_ORIGIN}/api/moaon/businesses/a3452bca-e259-40ed-a93d-b8bcc5c1b9e0/insights`;
const READONLY_PARTITION = 'persist:moaon-harin-readonly';
const MAX_LOGIN_QUERY_LENGTH = 512;
const LOGIN_QUERY_KEYS = new Set(['error', 'next']);
const ORDERS_PAGE_SIZE = 20;
const SNAPSHOT_PATTERN = /^[0-9a-f]{64}$/;

function realDate(value){if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;const [y,m,d]=value.split('-').map(Number),date=new Date(Date.UTC(y,m-1,d));return date.getUTCFullYear()===y&&date.getUTCMonth()===m-1&&date.getUTCDate()===d;}
function validSearch(search){return search&&typeof search==='object'&&!Array.isArray(search)&&Object.keys(search).length===3&&typeof search.query==='string'&&search.query.length<=100&&typeof search.start==='string'&&typeof search.end==='string'&&(!search.start||realDate(search.start))&&(!search.end||realDate(search.end))&&(!search.start||!search.end||search.start<=search.end);}
function validFilters(filters){return filters&&typeof filters==='object'&&!Array.isArray(filters)&&typeof filters.delayOnly==='boolean'&&typeof filters.giftOnly==='boolean'&&(Object.keys(filters).length===2||Object.keys(filters).length===5&&validSearch({query:filters.query,start:filters.start,end:filters.end}));}
const EMPTY_FILTERS=Object.freeze({delayOnly:false,giftOnly:false,query:'',start:'',end:''});
function searchSuffix(filters){const legacy=`&delayOnly=${filters.delayOnly}&giftOnly=${filters.giftOnly}`;return Object.keys(filters).length===2||!filters.query&&!filters.start&&!filters.end?legacy:`${legacy}&query=${encodeURIComponent(filters.query)}&start=${filters.start}&end=${filters.end}`;}
function buildOrdersScopeUrl(scope = 'ACTIVE', channel = 'ALL', filters = EMPTY_FILTERS) {
  if (!ORDER_SCOPE_SET.has(scope)) throw new TypeError('Invalid orders scope');
  if (!ORDER_CHANNELS.includes(channel)) throw new TypeError('Invalid orders channel');
  if(!validFilters(filters))throw new TypeError('Invalid orders filters');
  return `${ORDERS_PATH}${scope}&platform=${channel}${filters===EMPTY_FILTERS?'':searchSuffix(filters)}`;
}

function buildOrdersPageUrl(offset, snapshot, scope = 'ACTIVE', channel = 'ALL', filters = EMPTY_FILTERS) {
  buildOrdersScopeUrl(scope,channel,filters);
  const includeFilters=arguments.length>=5;
  const ordersUrl = `${ORDERS_PATH}${scope}&platform=${channel}${includeFilters?searchSuffix(filters):''}`;
  if (
    !Number.isSafeInteger(offset)
    || offset < 0
    || offset % ORDERS_PAGE_SIZE !== 0
    || typeof snapshot !== 'string'
    || !SNAPSHOT_PATTERN.test(snapshot)
  ) {
    throw new TypeError('Invalid orders page cursor');
  }
  return `${ordersUrl}&offset=${offset}&snapshot=${snapshot}`;
}
function buildOrdersExportUrl(scope='ACTIVE',channel='ALL',filters=EMPTY_FILTERS){return `${buildOrdersScopeUrl(scope,channel,filters)}&format=xlsx`;}

function parseOrdersPageUrl(value) {
  if (typeof value !== 'string') return null;
  const escapedPath = ORDERS_PATH.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = value.match(new RegExp(`^${escapedPath}(ACTIVE|REGISTER|IN_TRANSIT|COMPLETED)&platform=(?:ALL|CAFE24|NAVER|COUPANG)(?:&delayOnly=(true|false)&giftOnly=(true|false)(?:&query=([^&]*)&start=(\\d{4}-\\d{2}-\\d{2}|)&end=(\\d{4}-\\d{2}-\\d{2}|))?)?(?:&offset=([0-9]+)&snapshot=([0-9a-f]{64}))?$`));
  if (!match) return null;
  let query='';try{query=decodeURIComponent(match[4]||'');}catch{return null;}
  const filters=Object.freeze({delayOnly:match[2]==='true',giftOnly:match[3]==='true',query,start:match[5]||'',end:match[6]||''});
  if(!validFilters(filters))return null;
  if (match[7] === undefined) return Object.freeze({ scope: match[1], offset: 0, snapshot: null, filters });
  const offset = Number(match[7]);
  if (!Number.isSafeInteger(offset) || offset < 0 || offset % ORDERS_PAGE_SIZE !== 0 || String(offset) !== match[7]) return null;
  return Object.freeze({ scope: match[1], offset, snapshot: match[8], filters });
}

function isSafeLoginUrl(url) {
  if (url.origin !== HARIN_ORIGIN || url.pathname !== '/login') return false;
  if (url.hash || url.search.length > MAX_LOGIN_QUERY_LENGTH) return false;

  const seen = new Set();
  for (const [key, value] of url.searchParams) {
    if (!LOGIN_QUERY_KEYS.has(key) || seen.has(key)) return false;
    seen.add(key);
    if (key === 'next' && value !== '/') return false;
    if (key === 'error' && !/^[a-z_-]{1,32}$/.test(value)) return false;
  }
  return true;
}

function isLoginAsset(url) {
  if (url.origin !== HARIN_ORIGIN || url.search || url.hash) return false;
  if (url.pathname === '/favicon.ico') return true;
  return url.pathname.startsWith('/_next/static/') && url.pathname.length > '/_next/static/'.length;
}

function isMainProcessRequest(webContentsId) {
  return webContentsId === undefined
    || webContentsId === null
    || (Number.isInteger(webContentsId) && webContentsId <= 0);
}

function isAllowedRemoteRequest(details = {}, context = {}) {
  if (typeof details.url !== 'string' || typeof details.method !== 'string') return false;

  let url;
  try {
    url = new URL(details.url);
  } catch {
    return false;
  }
  if (url.username || url.password) return false;

  const method = details.method.toUpperCase();
  if(context.keyPermit?.url===details.url&&context.keyPermit.method===method&&details.url===HARIN_ORIGIN+'/api/moaon/connections'&&method==='POST')return isMainProcessRequest(details.webContentsId);
  if(context.teamPermit?.url===details.url&&context.teamPermit.method===method&&details.url===HARIN_ORIGIN+'/api/moaon/team'&&['GET','POST'].includes(method))return isMainProcessRequest(details.webContentsId);
  if(context.credentialPermit?.url===details.url&&context.credentialPermit.method===method&&url.origin===HARIN_ORIGIN&&url.pathname==='/api/moaon/credentials'&&!url.hash){
    const valid=method==='POST'&&!url.search||method==='GET'&&/^\?tenantId=[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}&provider=(?:CAFE24|NAVER|COUPANG|EPOST)$/.test(url.search);
    return Boolean(valid)&&isMainProcessRequest(details.webContentsId);
  }
  if(method==='GET'&&context.calendarPermit===details.url&&url.origin===HARIN_ORIGIN&&url.pathname==='/api/calendar/entries'&&!url.hash&&/^\?from=(\d{4}-\d{2}-\d{2})&to=\1$/.test(url.search))return isMainProcessRequest(details.webContentsId);
  if(method==='POST'&&context.calendarWritePermit===true&&details.url===HARIN_ORIGIN+'/api/calendar/entries')return isMainProcessRequest(details.webContentsId);
  if(method==='GET'&&context.monthPermit===details.url&&url.origin===HARIN_ORIGIN&&url.pathname==='/api/calendar/entries'&&!url.hash){
    const range=require('./today-calendar.cjs').monthRange(url.searchParams.get('from')?.slice(0,7));
    if(range&&url.search===`?from=${range.from}&to=${range.to}`)return isMainProcessRequest(details.webContentsId);
  }
  if(context.backgroundCsPermit===true&&method==='POST'&&details.url===HARIN_ORIGIN+'/api/customer-service/sync')return isMainProcessRequest(details.webContentsId);
  if(context.collectionPermit?.url===details.url&&context.collectionPermit.method===method&&['GET','POST'].includes(method)
    &&url.origin===HARIN_ORIGIN&&url.pathname==='/api/orders/live-refresh'&&!url.hash)return isMainProcessRequest(details.webContentsId);
  if(method==='POST'&&context.automaticTrackingRequestActive===true&&details.url===`${HARIN_ORIGIN}/api/shipping/tracking`)return isMainProcessRequest(details.webContentsId);
  if(['GET','POST'].includes(method)&&context.trackingRequestMethod===method&&details.url===`${HARIN_ORIGIN}/api/shipping/tracking`)return isMainProcessRequest(details.webContentsId);
  if(method==='GET'&&context.serverHistoryRequestActive===true&&details.url===`${HARIN_ORIGIN}/api/shipping/actions`)return isMainProcessRequest(details.webContentsId);
  if(method==='GET'&&context.deliveryRequestActive===true&&url.origin===HARIN_ORIGIN&&!url.hash&&(
    url.pathname==='/api/coupang/orders/detail'&&/^\?shipmentBoxId=\d{1,30}$/.test(url.search)
    ||/^\/api\/coupang\/operations\/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(url.pathname)&&!url.search
  ))return isMainProcessRequest(details.webContentsId);
  if(method==='GET'&&context.deliveryRequestActive===true&&url.origin===HARIN_ORIGIN&&url.pathname==='/api/cafe24/orders/delivery-detail'&&!url.hash&&/^\?orderId=[A-Za-z0-9_-]{1,80}$/.test(url.search))return isMainProcessRequest(details.webContentsId);
  if(method==='POST'&&details.url===`${HARIN_ORIGIN}/api/shipping/actions`&&context.registrationRequestActive===true)return isMainProcessRequest(details.webContentsId);
  if(method==='GET'&&context.automaticRequestActive===true&&new RegExp(`^${HARIN_ORIGIN.replaceAll('.','\\.')}\/api\/coupang\/operations\/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`,'i').test(details.url))return isMainProcessRequest(details.webContentsId);
  if(method==='GET'&&details.url===`${HARIN_ORIGIN}/api/moaon/businesses`)return isMainProcessRequest(details.webContentsId);
  if(method==='GET'&&context.financePermit===FINANCE_URL&&details.url===FINANCE_URL)return isMainProcessRequest(details.webContentsId);
  if(method==='GET'&&[SETTLEMENT_URL,SETTLEMENT_URL+'?days=7',SETTLEMENT_URL+'?days=90'].includes(context.settlementPermit)&&details.url===context.settlementPermit)return isMainProcessRequest(details.webContentsId);
  if(method==='GET'&&context.csPermit===CS_URL&&details.url===CS_URL)return isMainProcessRequest(details.webContentsId);
  if(context.stockPermit&&details.url===HARIN_ORIGIN+'/api/moaon/businesses/a3452bca-e259-40ed-a93d-b8bcc5c1b9e0/stock'&&context.stockPermit.url===details.url&&context.stockPermit.method===method)return isMainProcessRequest(details.webContentsId);
  if(method==='GET'&&context.inventoryPermit===INVENTORY_URL&&details.url===INVENTORY_URL)return isMainProcessRequest(details.webContentsId);
  if(method==='GET'&&context.insightsPermit===INSIGHTS_URL&&details.url===INSIGHTS_URL)return isMainProcessRequest(details.webContentsId);
  if(method==='POST'&&context.bidPermit===`${HARIN_ORIGIN}/api/moaon/businesses/a3452bca-e259-40ed-a93d-b8bcc5c1b9e0/keyword-bids`&&details.url===context.bidPermit)return isMainProcessRequest(details.webContentsId);
  if(method==='GET'&&context.exportPermit===details.url&&details.url.endsWith('&format=xlsx'))return isMainProcessRequest(details.webContentsId);
  if(method==='GET'&&Number.isInteger(context.labelWebContentsId)&&context.labelWebContentsId>0&&details.webContentsId===context.labelWebContentsId&&details.url===context.labelUrl
    && /^https:\/\/harin-cafe24-sync\.vercel\.app\/api\/shipping\/print\?type=label&ids=HR-(?:C24|CP)-[A-F0-9]{8}$/.test(details.url))return true;
  if(context.shipmentRequestActive===true && isMainProcessRequest(details.webContentsId)) {
    const endpoint=`${HARIN_ORIGIN}/api/epost/issue`;
    if(method==='POST'&&details.url===endpoint)return true;
    if(method==='GET'&&details.url.startsWith(endpoint+'?requestId=')
      && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(details.url.slice((endpoint+'?requestId=').length)))return true;
  }
  const loginWindowRequest = context.loginWindowActive === true
    && Number.isInteger(context.loginWebContentsId)
    && details.webContentsId === context.loginWebContentsId;

  if (method === 'GET' && parseOrdersPageUrl(details.url)) {
    return isMainProcessRequest(details.webContentsId);
  }

  if (!loginWindowRequest) return false;
  if (method === 'GET') return isSafeLoginUrl(url) || isLoginAsset(url);
  return method === 'POST'
    && url.origin === HARIN_ORIGIN
    && url.pathname === '/api/dashboard/login'
    && !url.search
    && !url.hash;
}

function isTrustedRenderer(event, mainWindow) {
  if (!event || !mainWindow || typeof mainWindow.isDestroyed !== 'function' || mainWindow.isDestroyed()) {
    return false;
  }
  const expected = mainWindow.webContents;
  const mainFrame = expected?.mainFrame;
  return Boolean(
    expected
    && mainFrame
    && event.sender === expected
    && event.senderFrame === mainFrame
    && event.senderFrame.url === APP_ENTRY_URL
    && expected.getURL() === APP_ENTRY_URL,
  );
}

module.exports = Object.freeze({
  APP_ENTRY_URL,
  HARIN_ORIGIN,
  LOGIN_URL,
  ORDER_SCOPES,
  ORDER_CHANNELS,
  ORDERS_URL,
  FINANCE_URL,
  SETTLEMENT_URL,
  READONLY_PARTITION,
  buildOrdersPageUrl,
  buildOrdersScopeUrl,
  buildOrdersExportUrl,
  validSearch,
  isAllowedRemoteRequest,
  isTrustedRenderer,
});
