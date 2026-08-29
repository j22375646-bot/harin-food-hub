'use strict';

const {buildPhase28MainModel}=require('./main.js');
const {buildPhase28OrdersModel}=require('./orders.js');
const {buildPhase28CsModel}=require('./cs.js');

const PHASE28_AVAILABLE_ADAPTERS=Object.freeze(['main','orders','cs']);

module.exports={
  PHASE28_AVAILABLE_ADAPTERS,
  buildPhase28MainModel,
  buildPhase28OrdersModel,
  buildPhase28CsModel
};
