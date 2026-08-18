'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const financialChanges = require('../lib/changes/financial-change.js');

const changeId='123e4567-e89b-12d3-a456-426614174000';

function directExecutionDb({ stale=false } = {}) {
  const before={ platform:'CAFE24', commission_rate:0.1, payment_fee_rate:0.03, default_shipping_cost:3000, notes:null };
  const after={ ...before, commission_rate:0.12 };
  const state={
    request:{
      id:changeId,
      status:'PREVIEWED',
      expires_at:new Date(Date.now()+60_000).toISOString(),
      change_type:'CHANNEL_COST',
      target_key:'CAFE24',
      before_value:{ exists:true, values:before },
      proposed_value:{ exists:true, values:after },
      rollback_value:{ exists:true, values:before },
      impact_preview:{ changes:[{ field:'commission_rate', before:0.1, after:0.12 }] }
    },
    current:stale ? { ...before, commission_rate:0.11 } : before,
    audits:[]
  };

  const db={
    from(table){
      let operation='select',patch=null;
      const filters=[];
      const chain={
        select(){ return chain; },
        update(value){ operation='update';patch=value;return chain; },
        eq(key,value){ filters.push([key,value]);return chain; },
        maybeSingle(){
          if(table==='financial_change_requests'){
            if(operation==='update'){
              const expected=filters.find(([key])=>key==='status')?.[1];
              if(expected!==state.request.status)return Promise.resolve({ data:null, error:null });
              state.request={...state.request,...patch};
            }
            return Promise.resolve({ data:{...state.request}, error:null });
          }
          if(table==='channel_cost_settings')return Promise.resolve({ data:{...state.current}, error:null });
          throw new Error(`unexpected maybeSingle table ${table}`);
        },
        upsert(value){
          if(table!=='channel_cost_settings')throw new Error(`unexpected upsert table ${table}`);
          state.current={...value};
          return Promise.resolve({ data:null, error:null });
        },
        insert(value){
          if(table!=='financial_change_audit_logs')throw new Error(`unexpected insert table ${table}`);
          state.audits.push(value);
          return Promise.resolve({ data:value, error:null });
        }
      };
      return chain;
    }
  };
  return { db, state, after };
}

test('22-1 owner confirmation executes and verifies a financial change in one server action', async () => {
  const {db,state,after}=directExecutionDb();
  const result=await financialChanges.confirmAndExecute(changeId,{db,actor:'owner'});
  assert.equal(result.applied,true);
  assert.equal(result.verified,true);
  assert.equal(result.request.status,'VERIFIED');
  assert.deepEqual(state.current,after);
  assert.deepEqual(state.audits.map(item=>item.event_type),[
    'APPROVED','EXECUTION_STARTED','EXECUTED','VERIFIED','OWNER_DIRECT_EXECUTION_COMPLETED'
  ]);
});

test('22-1 keeps stale-value protection and does not apply a changed preview', async () => {
  const {db,state}=directExecutionDb({stale:true});
  const result=await financialChanges.confirmAndExecute(changeId,{db,actor:'owner'});
  assert.equal(result.applied,false);
  assert.equal(result.blocked,true);
  assert.equal(result.stale,true);
  assert.equal(result.request.status,'STALE');
  assert.equal(state.current.commission_rate,0.11);
});

test('22-1 route and Naver table use the one-confirm direct execution action', () => {
  const route=fs.readFileSync('app/api/financial-changes/[id]/route.js','utf8');
  const table=fs.readFileSync('app/_analysis/keyword-operations-table.js','utf8');
  assert.match(route,/CONFIRM_EXECUTE/);
  assert.match(route,/confirmAndExecute/);
  assert.match(table,/action:'CONFIRM_EXECUTE',confirm:true/);
  assert.doesNotMatch(table,/변경승인에서 최종 승인하기/);
});
