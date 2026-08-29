'use strict';

const PHASE28_ROUTES=Object.freeze([
  {id:'home',href:'/',legacyView:'main',workspace:null,adapterId:'main',writePolicy:'READ_ONLY',preserveWorkspaces:false},
  {id:'orders',href:'/orders',legacyView:'orders',workspace:null,adapterId:'orders',writePolicy:'GUARDED',preserveWorkspaces:false},
  {id:'cs',href:'/cs',legacyView:'cs',workspace:null,adapterId:'cs',writePolicy:'GUARDED',preserveWorkspaces:false},
  {id:'inventory',href:'/inventory',legacyView:'inventory',workspace:null,adapterId:'inventory',writePolicy:'READ_ONLY',preserveWorkspaces:false},
  {id:'products',href:'/products/catalog',legacyView:'product',workspace:'catalog',adapterId:'products',writePolicy:'GUARDED',preserveWorkspaces:true},
  {id:'settlement',href:'/settlement-costs',legacyView:'settlement',workspace:null,adapterId:'settlement',writePolicy:'READ_ONLY',preserveWorkspaces:false},
  {id:'keywords',href:'/keywords/registered',legacyView:'keyword',workspace:'registered',adapterId:'keywords',writePolicy:'GUARDED',preserveWorkspaces:true},
  {id:'product-analysis',href:'/product-analysis',legacyView:'product-analysis',workspace:null,adapterId:'product-analysis',writePolicy:'READ_ONLY',preserveWorkspaces:false},
  {id:'analysis',href:'/insights/overview',legacyView:'insight',workspace:'overview',adapterId:'insights',writePolicy:'READ_ONLY',preserveWorkspaces:true},
  {id:'development',href:'/market-intelligence',legacyView:'market',workspace:null,adapterId:'development',writePolicy:'GUARDED',preserveWorkspaces:true},
  {id:'system',href:'/data-collection',legacyView:'collection',workspace:'overview',adapterId:'system',writePolicy:'GUARDED',preserveWorkspaces:true},
  {id:'notifications',href:'/notifications',legacyView:'notifications',workspace:null,adapterId:'notifications',writePolicy:'GUARDED',preserveWorkspaces:false},
  {id:'diagnoses',href:'/diagnoses',legacyView:'reports',workspace:null,adapterId:'diagnoses',writePolicy:'READ_ONLY',preserveWorkspaces:false},
  {id:'changes',href:'/approvals',legacyView:'changes',workspace:null,adapterId:'changes',writePolicy:'GUARDED',preserveWorkspaces:false},
  {id:'validation',href:'/execution-validation',legacyView:'validation',workspace:null,adapterId:'validation',writePolicy:'READ_ONLY',preserveWorkspaces:false},
  {id:'experiments',href:'/ab-tests',legacyView:'experiments',workspace:null,adapterId:'experiments',writePolicy:'GUARDED',preserveWorkspaces:false},
  {id:'knowledge',href:'/ai-knowledge',legacyView:'knowledge',workspace:null,adapterId:'knowledge',writePolicy:'GUARDED',preserveWorkspaces:false}
]);

const PHASE28_ROUTE_IDS=Object.freeze(PHASE28_ROUTES.map(item=>item.id));
const byId=new Map(PHASE28_ROUTES.map(item=>[item.id,item]));
const normalizePath=value=>String(value||'/').split('?')[0].replace(/\/+$/,'')||'/';

function phase28Route(id){ return byId.get(String(id||''))||null; }

function phase28RouteForPath(pathname){
  const path=normalizePath(pathname);
  return PHASE28_ROUTES.find(item=>normalizePath(item.href)===path)||null;
}

function phase28RouteForLegacyState({view,workspace}={}){
  const candidates=PHASE28_ROUTES.filter(route=>route.legacyView===view);
  return candidates.find(route=>route.workspace&&route.workspace===workspace)
    ||candidates.find(route=>route.workspace===null)
    ||(candidates.length===1?candidates[0]:null)
    ||null;
}

function validatePhase28Registry(routes=PHASE28_ROUTES){
  const issues=[];
  const ids=new Set();
  const hrefs=new Set();
  for(const route of routes){
    if(!route?.id)issues.push({code:'MISSING_ID'});
    else if(ids.has(route.id))issues.push({code:'DUPLICATE_ID',id:route.id});
    else ids.add(route.id);
    if(!String(route?.href||'').startsWith('/'))issues.push({code:'INVALID_HREF',id:route?.id||null});
    else if(hrefs.has(route.href))issues.push({code:'DUPLICATE_HREF',href:route.href});
    else hrefs.add(route.href);
    if(!route?.adapterId)issues.push({code:'MISSING_ADAPTER',id:route?.id||null});
    if(!['READ_ONLY','GUARDED'].includes(route?.writePolicy))issues.push({code:'INVALID_WRITE_POLICY',id:route?.id||null});
  }
  return issues;
}

module.exports={PHASE28_ROUTES,PHASE28_ROUTE_IDS,phase28Route,phase28RouteForLegacyState,phase28RouteForPath,validatePhase28Registry};
