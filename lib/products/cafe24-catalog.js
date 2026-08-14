'use strict';

const CATALOG_STATUS = Object.freeze({
  SELLING:'SELLING',
  OUT_OF_STOCK:'OUT_OF_STOCK',
  STOPPED:'STOPPED',
  NON_PRODUCT:'NON_PRODUCT'
});

const STATUS_LABEL = Object.freeze({
  SELLING:'판매중',
  OUT_OF_STOCK:'품절',
  STOPPED:'판매중단',
  NON_PRODUCT:'상품 제외'
});

const NON_PRODUCT_PATTERNS = [
  { code:'GIFT', label:'사은품', pattern:/사은품/i },
  { code:'EVENT', label:'이벤트', pattern:/이벤트/i },
  { code:'MEMBERSHIP', label:'멤버십', pattern:/멤버[십쉽]/i },
  { code:'COUPON', label:'쿠폰', pattern:/쿠폰/i },
  { code:'REWARD_PROMOTION', label:'리뷰·적립금 행사', pattern:/(?:리뷰.{0,20}적립금|적립금.{0,20}리뷰)/i }
];

function text(value) {
  return String(value == null ? '' : value).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function bool(value) {
  if (value === true || value === 1) return true;
  if (value === false || value === 0) return false;
  const normalized = String(value == null ? '' : value).trim().toUpperCase();
  if (['T','TRUE','Y','YES','1'].includes(normalized)) return true;
  if (['F','FALSE','N','NO','0'].includes(normalized)) return false;
  return null;
}

function categoryText(rawData = {}) {
  const values = [];
  const visit = (value, depth = 0) => {
    if (depth > 4 || value == null) return;
    if (typeof value === 'string' || typeof value === 'number') { values.push(String(value)); return; }
    if (Array.isArray(value)) { value.forEach(item => visit(item, depth + 1)); return; }
    if (typeof value !== 'object') return;
    for (const item of Object.values(value)) visit(item, depth + 1);
  };
  visit({ category:rawData.category, categories:rawData.categories, category_name:rawData.category_name, classification:rawData.classification });
  return text(values.join(' '));
}

function nonProductReason(product = {}) {
  const source = `${text(product.product_name || product.name)} ${categoryText(product.raw_data || {})}`;
  const matched = NON_PRODUCT_PATTERNS.find(item => item.pattern.test(source));
  return matched ? { code:matched.code, label:matched.label } : null;
}

function variantInventory(variant = {}) {
  const inventory = variant.inventories && typeof variant.inventories === 'object' ? variant.inventories : variant;
  const quantity = Number(inventory.quantity ?? variant.quantity);
  return {
    useInventory:bool(inventory.use_inventory ?? variant.use_inventory) === true,
    displaySoldout:bool(inventory.display_soldout ?? variant.display_soldout) === true,
    quantity:Number.isFinite(quantity) ? quantity : null
  };
}

function isSoldOut(product = {}) {
  const raw = product.raw_data || {};
  if (bool(raw.sold_out ?? product.sold_out) === true) return true;
  const variants = Array.isArray(raw.variants) ? raw.variants : [];
  const purchasable = variants.filter(variant => bool(variant.display) !== false && bool(variant.selling) !== false);
  if (!purchasable.length) return false;
  return purchasable.every(variant => {
    const inventory = variantInventory(variant);
    return inventory.useInventory && inventory.displaySoldout && inventory.quantity != null && inventory.quantity <= 0;
  });
}

function classifyCafe24Product(product = {}) {
  const excluded = nonProductReason(product);
  if (excluded) return { status:CATALOG_STATUS.NON_PRODUCT, label:STATUS_LABEL.NON_PRODUCT, is_sellable:false, excluded:true, reason:excluded };
  if (bool(product.selling) !== true || bool(product.display) !== true) return { status:CATALOG_STATUS.STOPPED, label:STATUS_LABEL.STOPPED, is_sellable:false, excluded:false, reason:null };
  if (isSoldOut(product)) return { status:CATALOG_STATUS.OUT_OF_STOCK, label:STATUS_LABEL.OUT_OF_STOCK, is_sellable:false, excluded:false, reason:null };
  return { status:CATALOG_STATUS.SELLING, label:STATUS_LABEL.SELLING, is_sellable:true, excluded:false, reason:null };
}

function catalogProduct(product = {}) {
  const classification = classifyCafe24Product(product);
  return {
    ...product,
    catalog_status:classification.status,
    status_label:classification.label,
    is_sellable:classification.is_sellable,
    excluded:classification.excluded,
    exclusion_reason:classification.reason
  };
}

function summarizeCafe24Catalog(products = []) {
  const classified = products.map(catalogProduct);
  return {
    total:classified.length,
    selling:classified.filter(item => item.catalog_status === CATALOG_STATUS.SELLING).length,
    out_of_stock:classified.filter(item => item.catalog_status === CATALOG_STATUS.OUT_OF_STOCK).length,
    stopped:classified.filter(item => item.catalog_status === CATALOG_STATUS.STOPPED).length,
    excluded:classified.filter(item => item.catalog_status === CATALOG_STATUS.NON_PRODUCT).length
  };
}

async function reconcileCafe24Catalog({ db, products = [] }) {
  const classified = products.map(catalogProduct);
  const byId = new Map(classified.map(item => [String(item.external_product_no), item]));
  const linksResult = await db.from('channel_products').select('id,external_product_id,master_product_id,is_active').eq('platform','CAFE24').limit(5000);
  if (linksResult.error) throw linksResult.error;
  const links = linksResult.data || [];
  const linkedIds = new Set(links.map(item => String(item.external_product_id)));

  const existingRows = links.map(link => {
    if (!link.master_product_id) return null;
    const product = byId.get(String(link.external_product_id));
    if (!product) return null;
    return {
      master_product_id:link.master_product_id,
      platform:'CAFE24',
      external_product_id:String(product.external_product_no),
      external_product_name:product.product_name,
      selling_price:product.price,
      is_active:product.is_sellable,
      raw_data:{ ...(product.raw_data || {}), catalog_status:product.catalog_status, exclusion_reason:product.exclusion_reason || null },
      match_method:'SOURCE',
      match_confidence:1,
      matched_at:new Date().toISOString(),
      matched_by:'SYSTEM'
    };
  }).filter(Boolean);
  if (existingRows.length) {
    const updated = await db.from('channel_products').upsert(existingRows,{ onConflict:'platform,external_product_id' });
    if (updated.error) throw updated.error;
  }

  const activeByMaster = new Map();
  for (const link of links) {
    if (!link.master_product_id) continue;
    const product = byId.get(String(link.external_product_id));
    const current = activeByMaster.get(link.master_product_id) || false;
    activeByMaster.set(link.master_product_id, current || Boolean(product?.is_sellable));
  }
  const activeMasters = [...activeByMaster].filter(([,active]) => active).map(([id]) => id);
  const inactiveMasters = [...activeByMaster].filter(([,active]) => !active).map(([id]) => id);
  if (activeMasters.length) {
    const result = await db.from('master_products').update({ is_active:true }).in('id',activeMasters);
    if (result.error) throw result.error;
  }
  if (inactiveMasters.length) {
    const result = await db.from('master_products').update({ is_active:false }).in('id',inactiveMasters);
    if (result.error) throw result.error;
  }

  const missing = classified.filter(product => product.is_sellable && !linkedIds.has(String(product.external_product_no)));
  let created = 0;
  if (missing.length) {
    const masters = await db.from('master_products').insert(missing.map(product => ({ name:product.product_name, selling_price:product.price, is_active:true }))).select('id');
    if (masters.error) throw masters.error;
    const newLinks = missing.map((product,index) => ({
      master_product_id:masters.data[index].id,
      platform:'CAFE24',
      external_product_id:String(product.external_product_no),
      external_product_name:product.product_name,
      selling_price:product.price,
      is_active:true,
      raw_data:{ ...(product.raw_data || {}), catalog_status:product.catalog_status },
      match_method:'SOURCE',
      match_confidence:1,
      matched_at:new Date().toISOString(),
      matched_by:'SYSTEM'
    }));
    const insertedLinks = await db.from('channel_products').upsert(newLinks,{ onConflict:'platform,external_product_id' });
    if (insertedLinks.error) throw insertedLinks.error;
    created = missing.length;
  }

  return { ...summarizeCafe24Catalog(products), created, linked:links.length + created };
}

async function masterProductEligibility({ db, masterProductId }) {
  const links = await db.from('channel_products').select('external_product_id,is_active').eq('platform','CAFE24').eq('master_product_id',masterProductId).limit(20);
  if (links.error) throw links.error;
  if (!(links.data || []).length) return { eligible:false, reason:'CAFE24_LINK_REQUIRED' };
  const ids = links.data.map(item => item.external_product_id);
  const products = await db.from('cafe24_products').select('external_product_no,product_name,price,display,selling,raw_data').in('external_product_no',ids);
  if (products.error) throw products.error;
  const selling = (products.data || []).map(catalogProduct).find(item => item.is_sellable);
  return selling ? { eligible:true, product:selling } : { eligible:false, reason:'PRODUCT_NOT_SELLING' };
}

module.exports = {
  CATALOG_STATUS,
  STATUS_LABEL,
  catalogProduct,
  classifyCafe24Product,
  isSoldOut,
  masterProductEligibility,
  nonProductReason,
  reconcileCafe24Catalog,
  summarizeCafe24Catalog
};
