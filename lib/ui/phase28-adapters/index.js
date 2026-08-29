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
const {buildPhase28DevelopmentModel}=require('./development.js');
const {buildPhase28SystemModel,buildPhase28SystemProviderDetail,CORE_SERVICE_IDS}=require('./system.js');
const {buildPhase28NotificationsModel}=require('./notifications.js');
const {buildPhase28DiagnosesModel}=require('./diagnoses.js');

const PHASE28_AVAILABLE_ADAPTERS=Object.freeze(['main','orders','cs','inventory','products','settlement','keywords','product-analysis','insights','development','system','notifications','diagnoses']);

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
  normalizeInsightReportDetail,
  buildPhase28DevelopmentModel,
  buildPhase28SystemModel,
  buildPhase28SystemProviderDetail,
  CORE_SERVICE_IDS,
  buildPhase28NotificationsModel,
  buildPhase28DiagnosesModel
};
