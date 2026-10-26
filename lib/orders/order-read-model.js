'use strict';
// Only overlapping stored-list data reads are shared. Authorization and final
// membership checks remain per request. Shipment preflight never uses this path.
function createOrderReadModelReader({loadOrders,loadEvents}){
 const pending=new WeakMap();
 return db=>{
  let work=pending.get(db);
  if(!work){
   const operation=Promise.all([Promise.resolve().then(()=>loadOrders({db})),Promise.resolve().then(()=>loadEvents(db))]).then(([center,eventResult])=>({center,eventResult}));
   work=operation.finally(()=>{if(pending.get(db)===work)pending.delete(db);});pending.set(db,work);
  }
  return work.then(value=>structuredClone(value));
 };
}
const loadOrderReadModel=createOrderReadModelReader({loadOrders:options=>require('./unified-orders.js').loadUnifiedOrders(options),loadEvents:db=>require('../calendar/order-events.js').loadOrderEvents(db)});
module.exports={createOrderReadModelReader,loadOrderReadModel};
