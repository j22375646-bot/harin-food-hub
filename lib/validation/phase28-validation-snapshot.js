'use strict';

const ACTION_FIELDS='id,platform,target_type,target_id,target_name,action_type,reason,status,before_value,after_value,decided_at,executed_at,review_after,priority,created_at';
const EVALUATION_FIELDS='id,action_id,baseline_start,baseline_end,evaluation_start,evaluation_end,metric_name,before_json,after_json,change_rate,outcome,explanation,evaluated_at';
const REPORT_FIELDS='id,platform,title,created_at';
const EXPERIMENT_FIELDS='id,name,platform,status,evaluation_status,result_summary,created_at,ab_test_variants(id,entity_id,name,is_control)';
const ORDER_FIELDS='order_id,order_date,customer_id,payment_status,paid_amount,order_price,cancel_amount,refund_amount,raw_data';
const ITEM_FIELDS='order_id,external_item_id,external_product_no,product_name,option_name,quantity,unit_price,paid_amount';

function message(result){return result?.error?.message||null;}

async function loadPhase28ValidationSnapshot({db,now=new Date()}={}){
  if(!db||typeof db.from!=='function')throw new Error('실행검증 저장소를 확인할 수 없습니다.');
  const generatedAt=new Date(now);
  const historyStart=new Date(generatedAt.getTime()-90*24*60*60*1000).toISOString();
  const queries=[
    db.from('actions').select(ACTION_FIELDS).order('decided_at',{ascending:false}).limit(100),
    db.from('action_evaluations').select(EVALUATION_FIELDS).order('evaluated_at',{ascending:false}).limit(240),
    db.from('reports').select(REPORT_FIELDS).order('created_at',{ascending:false}).limit(50),
    db.from('ab_tests').select(EXPERIMENT_FIELDS).order('created_at',{ascending:false}).limit(80),
    db.from('cafe24_orders').select(ORDER_FIELDS).gte('order_date',historyStart).order('order_date',{ascending:false}).limit(1200),
    db.from('cafe24_order_items').select(ITEM_FIELDS).limit(4000)
  ];
  const [actions,evaluations,reports,experiments,orders,items]=await Promise.all(queries);
  if(actions?.error)throw new Error(message(actions)||'실행 기록을 불러오지 못했습니다.');
  if(evaluations?.error)throw new Error(message(evaluations)||'7·14일 평가를 불러오지 못했습니다.');
  const customerMessages=[message(orders),message(items)].filter(Boolean);
  const orderIds=new Set((orders?.data||[]).map(row=>String(row.order_id||'')).filter(Boolean));
  const filteredItems=(items?.data||[]).filter(row=>orderIds.has(String(row.order_id||'')));
  return {
    generatedAt:generatedAt.toISOString(),
    actions:actions?.data||[],evaluations:evaluations?.data||[],
    reports:reports?.error?[]:reports?.data||[],reportsError:message(reports),
    experiments:experiments?.error?[]:experiments?.data||[],experimentsError:message(experiments),
    orders:orders?.error?[]:orders?.data||[],items:items?.error?[]:filteredItems,
    customerError:customerMessages.length?customerMessages.join(' · '):null
  };
}

module.exports={ACTION_FIELDS,EVALUATION_FIELDS,REPORT_FIELDS,EXPERIMENT_FIELDS,ORDER_FIELDS,ITEM_FIELDS,loadPhase28ValidationSnapshot};
