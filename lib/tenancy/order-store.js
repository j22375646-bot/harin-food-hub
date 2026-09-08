'use strict';
// Internal storage seam only. Callers MUST resolve a fresh context per request
// and revalidate membership before exposing results/committing external work.
// Not wired into runtime: the legacy Harin route and its OWNER gate stay intact.
const {authorizeAction}=require('./permissions.js');
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const STATUSES=new Set(['PAID','PREPARING','READY_TO_SHIP','WAITING_FOR_CARRIER','SHIPPING','DELIVERED','CANCELLED']);
const SELECT=`o.connection_id as "connectionId", o.external_order_id as "externalOrderId",
 c.provider, o.product_name as "productName", o.paid_amount as "paidAmount",
 o.status, o.source_updated_at as "sourceUpdatedAt"`;
function invalid(){throw Object.assign(new Error('Invalid order input'),{code:'INVALID_ORDER_INPUT'});}
function object(value,keys){if(!value||Object.getPrototypeOf(value)!==Object.prototype||Object.keys(value).some(k=>!keys.includes(k)))invalid();}
function text(value,max){if(typeof value!=='string'||!value.length||value!==value.trim()||value.length>max||/[\u0000-\u001f]/.test(value))invalid();return value;}
function identity(input){object(input,['connectionId','externalOrderId']);if(!UUID.test(input.connectionId))invalid();text(input.externalOrderId,128);return {...input};}
function project(row){return {...row,paidAmount:row.paidAmount===null?null:Number(row.paidAmount),sourceUpdatedAt:new Date(row.sourceUpdatedAt).toISOString()};}
function createTenantOrderStore({database}={}){
 if(typeof database?.transaction!=='function')throw TypeError('Transaction database required');
 async function scoped(context,action,work){
  authorizeAction(context,action);if(!UUID.test(context.tenantId))invalid();
  const tenant=context.tenantId;
  try{return await database.transaction(async tx=>{
   // Transaction-local setting cannot survive COMMIT/ROLLBACK into the next tenant.
   await tx.query("select set_config('moaon.tenant_id',$1,true)",[tenant]);
   return work(tx,tenant);
  });}catch(error){if(error.code==='CONNECTION_UNAVAILABLE')throw error;
   throw Object.assign(new Error('Order storage unavailable'),{code:'ORDER_STORAGE_UNAVAILABLE'});
  }
 }
 return Object.freeze({
  async save(context,input){
   object(input,['connectionId','externalOrderId','productName','paidAmount','status','sourceUpdatedAt']);
   const key=identity({connectionId:input.connectionId,externalOrderId:input.externalOrderId});
   const productName=text(input.productName,500),status=input.status,amount=input.paidAmount,updated=input.sourceUpdatedAt;
   if(!STATUSES.has(status)||(amount!==null&&(!Number.isSafeInteger(amount)||amount<0||amount>9000000000000)))invalid();
   if(typeof updated!=='string'||!Number.isFinite(Date.parse(updated))||new Date(updated).toISOString()!==updated)invalid();
   return scoped(context,'orders.write',async(tx,tenant)=>{
    // Snapshot check only: connection revoke/write fencing is a runtime gate,
    // not claimed by this candidate storage layer. No connection UPDATE grant.
    const connection=await tx.query("select id from moaon_data.connections where tenant_id=$1 and id=$2 and status='ACTIVE'",[tenant,key.connectionId]);
    if(!connection.rows.length)throw Object.assign(new Error('Connection unavailable'),{code:'CONNECTION_UNAVAILABLE'});
    const result=await tx.query(`insert into moaon_data.orders as existing
     (tenant_id,connection_id,external_order_id,product_name,paid_amount,status,source_updated_at)
     values($1,$2,$3,$4,$5,$6,$7)
     on conflict(tenant_id,connection_id,external_order_id) do update set
     product_name=excluded.product_name,paid_amount=excluded.paid_amount,status=excluded.status,source_updated_at=excluded.source_updated_at
     where existing.source_updated_at<excluded.source_updated_at returning external_order_id`,
     [tenant,key.connectionId,key.externalOrderId,productName,amount,status,updated]);
    return {saved:result.rows.length===1};
   });
  },
  async get(context,input){
   const key=identity(input);
   return scoped(context,'workspace.read',async(tx,tenant)=>{
    const result=await tx.query(`select ${SELECT} from moaon_data.orders o join moaon_data.connections c
     on c.tenant_id=o.tenant_id and c.id=o.connection_id
     where o.tenant_id=$1 and o.connection_id=$2 and o.external_order_id=$3 and c.status='ACTIVE'`,[tenant,key.connectionId,key.externalOrderId]);
    return result.rows.length?project(result.rows[0]):null;
   });
  },
  async list(context,options={}){
   object(options,['limit']);const limit=options.limit===undefined?50:options.limit;
   if(!Number.isInteger(limit)||limit<1||limit>100)invalid();
   return scoped(context,'workspace.read',async(tx,tenant)=>{
    const result=await tx.query(`select ${SELECT} from moaon_data.orders o join moaon_data.connections c
     on c.tenant_id=o.tenant_id and c.id=o.connection_id
     where o.tenant_id=$1 and c.status='ACTIVE' order by o.connection_id,o.external_order_id limit $2`,[tenant,limit]);
    return result.rows.map(project);
   });
  },
 });
}
module.exports={createTenantOrderStore};
