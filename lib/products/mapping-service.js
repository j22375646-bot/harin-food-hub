'use strict';

const matcher = require('./matcher.js');

const PLATFORMS = new Set(['NAVER', 'COUPANG']);

function number(value) { return Number(value || 0); }

function createProductSources({ coupangProducts = [], coupangProductItems = [], naverAdgroups = [], naverCampaigns = [] }) {
  const prices = new Map();
  for (const item of coupangProductItems) {
    if (!item.seller_product_id || !(number(item.sale_price) > 0)) continue;
    const key = String(item.seller_product_id), current = prices.get(key) || [];
    current.push(number(item.sale_price)); prices.set(key, current);
  }
  const coupang = coupangProducts.map(item => {
    const itemPrices = prices.get(String(item.seller_product_id)) || [];
    return {
      platform:'COUPANG', external_product_id:String(item.seller_product_id), name:item.product_name,
      external_product_name:item.product_name, selling_price:itemPrices.length ? Math.min(...itemPrices) : null,
      is_active:!/(deleted|stopped|suspended)/i.test(String(item.status || '')),
      source_type:'COUPANG_SELLER_PRODUCT',
      raw_data:{ source_type:'COUPANG_SELLER_PRODUCT', status:item.status || null }
    };
  }).filter(item => item.external_product_id && item.name);

  const campaigns = new Map(naverCampaigns.map(item => [item.ncc_campaign_id, item]));
  const naver = naverAdgroups.map(item => {
    const campaign = campaigns.get(item.ncc_campaign_id);
    if (!campaign || !['SHOPPING','WEB_SITE'].includes(campaign.campaign_type)) return null;
    const displayName = `${campaign.name} / ${item.name}`;
    return {
      platform:'NAVER', external_product_id:String(item.ncc_adgroup_id), name:item.name,
      external_product_name:displayName, selling_price:null,
      is_active:item.status !== 'PAUSED' && item.user_lock !== true,
      source_type:'NAVER_ADGROUP',
      raw_data:{ source_type:'NAVER_ADGROUP', campaign_id:item.ncc_campaign_id, campaign_name:campaign.name, campaign_type:campaign.campaign_type, adgroup_name:item.name }
    };
  }).filter(Boolean);
  return [...coupang, ...naver];
}

function rejectedPairKeys(history = []) {
  const seen = new Set(), rejected = [];
  for (const item of history) {
    const masterId = item.action === 'UNLINKED' ? item.previous_master_product_id : item.new_master_product_id;
    if (!masterId) continue;
    const key = `${item.platform}:${item.external_product_id}:${masterId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (['REJECTED','UNLINKED'].includes(item.action)) rejected.push(key);
  }
  return rejected;
}

function dashboardSummary(masterProducts, channelProducts, candidates, sources) {
  const linked = channelProducts.filter(item => item.master_product_id);
  return {
    master_products:masterProducts.length,
    linked_total:linked.length,
    linked_naver:linked.filter(item => item.platform === 'NAVER').length,
    linked_coupang:linked.filter(item => item.platform === 'COUPANG').length,
    source_naver:sources.filter(item => item.platform === 'NAVER').length,
    source_coupang:sources.filter(item => item.platform === 'COUPANG').length,
    candidate_total:candidates.length,
    auto_eligible:candidates.filter(item => item.auto_eligible).length
  };
}

function buildMappingDashboard({ masterProducts = [], channelProducts = [], coupangProducts = [], coupangProductItems = [], naverAdgroups = [], naverCampaigns = [], history = [] }) {
  const sources = createProductSources({ coupangProducts, coupangProductItems, naverAdgroups, naverCampaigns });
  const candidates = matcher.buildMappingCandidates({ masterProducts, sources, existingLinks:channelProducts, rejectedPairs:rejectedPairKeys(history) });
  return {
    summary:dashboardSummary(masterProducts, channelProducts, candidates, sources),
    candidates,
    links:channelProducts.filter(item => item.master_product_id && PLATFORMS.has(item.platform)),
    history:history.slice(0, 50)
  };
}

async function loadMappingDashboard({ db }) {
  const [masters, links, coupangProducts, coupangItems, naverGroups, naverCampaigns, history] = await Promise.all([
    db.from('master_products').select('id,name,selling_price,is_active').eq('is_active',true).order('name'),
    db.from('channel_products').select('id,master_product_id,platform,external_product_id,external_product_name,selling_price,is_active,match_method,match_confidence,matched_at,matched_by').order('updated_at',{ascending:false}).limit(1000),
    db.from('coupang_products').select('seller_product_id,product_name,status').order('updated_at',{ascending:false}).limit(500),
    db.from('coupang_product_items').select('seller_product_id,sale_price,status').limit(2000),
    db.from('naver_adgroups').select('ncc_adgroup_id,ncc_campaign_id,name,status,user_lock').limit(1000),
    db.from('naver_campaigns').select('ncc_campaign_id,name,campaign_type,status').limit(500),
    db.from('product_mapping_history').select('id,platform,external_product_id,external_product_name,previous_master_product_id,new_master_product_id,action,match_method,match_confidence,actor,created_at').order('created_at',{ascending:false}).limit(1000)
  ]);
  const firstError = [masters,links,coupangProducts,coupangItems,naverGroups,naverCampaigns,history].find(result => result.error)?.error;
  if (firstError) throw firstError;
  return buildMappingDashboard({
    masterProducts:masters.data || [], channelProducts:links.data || [],
    coupangProducts:coupangProducts.data || [], coupangProductItems:coupangItems.data || [],
    naverAdgroups:naverGroups.data || [], naverCampaigns:naverCampaigns.data || [], history:history.data || []
  });
}

function findSource(dashboard, platform, externalId) {
  const fromCandidate = dashboard.candidates.find(item => item.platform === platform && item.external_product_id === externalId);
  if (fromCandidate) return fromCandidate;
  const link = dashboard.links.find(item => item.platform === platform && item.external_product_id === externalId);
  return link ? { platform, external_product_id:externalId, external_product_name:link.external_product_name, name:link.external_product_name, selling_price:link.selling_price, raw_data:{ source_type:'EXISTING_LINK' } } : null;
}

async function callMappingRpc({ db, source, masterProductId, action, method, confidence, actor = 'DASHBOARD' }) {
  const result = await db.rpc('apply_product_mapping', {
    p_platform:source.platform,
    p_external_product_id:source.external_product_id,
    p_external_product_name:source.external_product_name || source.name,
    p_master_product_id:masterProductId || null,
    p_action:action,
    p_match_method:method || null,
    p_match_confidence:confidence == null ? null : Number(confidence),
    p_actor:String(actor || 'DASHBOARD').slice(0, 100),
    p_selling_price:source.selling_price == null ? null : number(source.selling_price),
    p_raw_data:{ ...(source.raw_data || {}), candidate_master_product_id:masterProductId || null }
  });
  if (result.error) throw result.error;
  return result.data;
}

async function mutateMapping({ db, body, actor = 'DASHBOARD' }) {
  const action = String(body.action || '').toUpperCase();
  const dashboard = await loadMappingDashboard({ db });
  if (action === 'AUTO_LINK_ALL') {
    const targets = dashboard.candidates.filter(item => item.auto_eligible).slice(0, 100);
    const results = [];
    for (const source of targets) {
      const candidate = source.candidates[0];
      results.push(await callMappingRpc({ db, source, masterProductId:candidate.master_product_id, action:'LINK', method:'AUTO', confidence:candidate.score, actor }));
    }
    return { action, linked:results.length, results };
  }

  const platform = String(body.platform || '').toUpperCase(), externalId = String(body.external_product_id || '');
  if (!PLATFORMS.has(platform) || !externalId) throw new Error('플랫폼과 원천 상품을 확인해주세요.');
  const source = findSource(dashboard, platform, externalId);
  if (!source) throw new Error('현재 수집 데이터에서 원천 상품을 찾지 못했습니다.');

  if (action === 'UNLINK') return callMappingRpc({ db, source, masterProductId:null, action:'UNLINK', method:'MANUAL', confidence:null, actor });
  if (!['LINK','REJECT'].includes(action)) throw new Error('지원하지 않는 매핑 작업입니다.');
  const masterId = String(body.master_product_id || '');
  const master = (await db.from('master_products').select('id,name,selling_price').eq('id',masterId).maybeSingle());
  if (master.error) throw master.error;
  if (!master.data) throw new Error('기준상품을 찾지 못했습니다.');
  const calculated = matcher.scoreProductMatch(master.data, source);
  return callMappingRpc({ db, source, masterProductId:masterId, action, method:'MANUAL', confidence:calculated.score, actor });
}

module.exports = {
  createProductSources,
  rejectedPairKeys,
  buildMappingDashboard,
  loadMappingDashboard,
  mutateMapping
};
