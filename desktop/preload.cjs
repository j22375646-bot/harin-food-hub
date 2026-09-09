'use strict';

const { contextBridge, ipcRenderer } = require('electron');
const validWorklistIds=ids=>Array.isArray(ids)&&ids.length>0&&ids.length<=20&&ids.every(id=>typeof id==='string'&&/^HR-(?:C24|CP|NV)-[A-F0-9]{8}$/.test(id))&&new Set(ids).size===ids.length;
const previewWorklist=(ids,type)=>{if(!validWorklistIds(ids)||!['packing','dispatch'].includes(type))throw Error('Invalid worklist arguments');return ipcRenderer.invoke('moaon-hub:preview-worklist',ids,type);};
const onWindowRestored=listener=>{
  if(typeof listener!=='function')throw Error('Invalid restore listener');
  const handler=()=>listener();
  ipcRenderer.on('moaon-hub:window-restored',handler);
  return ()=>ipcRenderer.removeListener('moaon-hub:window-restored',handler);
};
const realDate=value=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;const [y,m,d]=value.split('-').map(Number),date=new Date(Date.UTC(y,m-1,d));return date.getUTCFullYear()===y&&date.getUTCMonth()===m-1&&date.getUTCDate()===d;};
const validOrderSearch=value=>value&&typeof value==='object'&&!Array.isArray(value)&&['query','start','end'].every(key=>Object.hasOwn(value,key))&&typeof value.query==='string'&&value.query.length<=100&&typeof value.start==='string'&&typeof value.end==='string'&&(!value.start||realDate(value.start))&&(!value.end||realDate(value.end))&&(!value.start||!value.end||value.start<=value.end);

contextBridge.exposeInMainWorld('moaonHub', Object.freeze({
  readCredentialMetadata: value => ipcRenderer.invoke('moaon-hub:read-credential-metadata',value),
  saveServerCredential: value => ipcRenderer.invoke('moaon-hub:save-server-credential',value),
  saveApiDraft: value => ipcRenderer.invoke('moaon-hub:save-api-draft',value),
  saveOwnedApiDraft: value => ipcRenderer.invoke('moaon-hub:save-owned-api-draft',value),
  listApiDrafts: () => ipcRenderer.invoke('moaon-hub:list-api-drafts'),
  removeApiDraft: value => ipcRenderer.invoke('moaon-hub:remove-api-draft',value),
  collectOrders: () => ipcRenderer.invoke('moaon-hub:collect-orders'),
  checkOrderCollection: () => ipcRenderer.invoke('moaon-hub:check-order-collection'),
  checkOrderFreshness: () => ipcRenderer.invoke('moaon-hub:check-order-freshness'),
  onWindowRestored,
  readTracking: (id) => ipcRenderer.invoke('moaon-hub:read-tracking',id),
  refreshTracking: (id) => ipcRenderer.invoke('moaon-hub:refresh-tracking',id),
  readServerShippingHistory: () => ipcRenderer.invoke('moaon-hub:server-shipping-history'),
  findOrder: (id) => ipcRenderer.invoke('moaon-hub:find-order',id),
  restoreShippingHistory: () => ipcRenderer.invoke('moaon-hub:restore-shipping-history'),
  readDelivery: (id) => ipcRenderer.invoke('moaon-hub:read-delivery',id),
  readOverview: () => ipcRenderer.invoke('moaon-hub:read-overview'),
  readFinance: () => ipcRenderer.invoke('moaon-hub:read-finance'),
  readInsights: () => ipcRenderer.invoke('moaon-hub:read-insights'),
  readSettlement: (days=30) => ipcRenderer.invoke('moaon-hub:read-settlement',days),
  readTodayCalendar: () => ipcRenderer.invoke('moaon-hub:read-today-calendar'),
  readCalendarMonth: month => ipcRenderer.invoke('moaon-hub:read-calendar-month',month),
  listBusinesses: () => ipcRenderer.invoke('moaon-hub:list-businesses'),
  appInfo: () => ipcRenderer.invoke('moaon-hub:app-info'),
  inspectPrinters: () => ipcRenderer.invoke('moaon-hub:inspect-printers'),
  previewLabel: (id) => ipcRenderer.invoke('moaon-hub:preview-label',id),
  previewLabels: (ids) => ipcRenderer.invoke('moaon-hub:preview-labels',ids),
  previewWorklist,
  exportSelectedCsv: (ids) => ipcRenderer.invoke('moaon-hub:export-selected-csv',ids),
  issueShipment: (id) => ipcRenderer.invoke('moaon-hub:issue-shipment',id),
  issueAndRegister: (ids) => ipcRenderer.invoke('moaon-hub:issue-and-register',ids),
  checkShipment: (id) => ipcRenderer.invoke('moaon-hub:check-shipment',id),
  confirmShipmentReview: (id) => ipcRenderer.invoke('moaon-hub:confirm-shipment-review',id),
  connect: () => ipcRenderer.invoke('moaon-hub:connect'),
  refresh: () => ipcRenderer.invoke('moaon-hub:refresh'),
  recheckPage: () => ipcRenderer.invoke('moaon-hub:recheck-page'),
  nextPage: () => ipcRenderer.invoke('moaon-hub:next-page'),
  previousPage: () => ipcRenderer.invoke('moaon-hub:previous-page'),
  viewActive: () => ipcRenderer.invoke('moaon-hub:view-active'),
  viewChannel: (channel) => ipcRenderer.invoke('moaon-hub:view-channel',channel),
  setOrderFilters: (filters) => {
    if(!filters||typeof filters!=='object'||Array.isArray(filters)||![2,5].includes(Object.keys(filters).length)||typeof filters.delayOnly!=='boolean'||typeof filters.giftOnly!=='boolean'||(Object.keys(filters).length===5&&!validOrderSearch({query:filters.query,start:filters.start,end:filters.end})))throw Error('Invalid filter arguments');
    return ipcRenderer.invoke('moaon-hub:set-order-filters',filters);
  },
  resetOrderFilters: () => ipcRenderer.invoke('moaon-hub:reset-order-filters'),
  applyOrderSearch: search => {if(!validOrderSearch(search))throw Error('Invalid search arguments');return ipcRenderer.invoke('moaon-hub:apply-order-search',search);},
  exportOrdersXlsx: () => ipcRenderer.invoke('moaon-hub:export-orders-xlsx'),
  registerInvoices: (ids) => ipcRenderer.invoke('moaon-hub:register-invoices',ids),
  viewRegistered: () => ipcRenderer.invoke('moaon-hub:view-registered'),
  viewInTransit: () => ipcRenderer.invoke('moaon-hub:view-in-transit'),
  viewCompleted: () => ipcRenderer.invoke('moaon-hub:view-completed'),
  disconnect: () => ipcRenderer.invoke('moaon-hub:disconnect'),
}));
