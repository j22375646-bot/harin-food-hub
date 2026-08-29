'use strict';

const {buildPhase28MainModel}=require('./main.js');
const {buildPhase28OrdersModel}=require('./orders.js');
const {buildPhase28CsModel}=require('./cs.js');
const {buildPhase28InventoryModel}=require('./inventory.js');
const {buildPhase28ProductsModel}=require('./products.js');
const {buildPhase28SettlementModel}=require('./settlement.js');
const {buildPhase28KeywordsModel}=require('./keywords.js');
const {buildPhase28ProductAnalysisModel}=require('./product-analysis.js');
const {buildPhase28InsightsModel,normalizeInsightReportDetail}=require('./insights.js');

const PHASE28_AVAILABLE_ADAPTERS=Object.freeze(['main','orders','cs','inventory','products','settlement','keywords','product-analysis','insights']);

module.exports={
  PHASE28_AVAILABLE_ADAPTERS,
  buildPhase28MainModel,
  buildPhase28OrdersModel,
  buildPhase28CsModel,
  buildPhase28InventoryModel,
  buildPhase28ProductsModel,
  buildPhase28SettlementModel,
  buildPhase28KeywordsModel,
  buildPhase28ProductAnalysisModel,
  buildPhase28InsightsModel,
  normalizeInsightReportDetail
};
