'use strict';

const foundation=require('./foundation.js');

const ACTIVE_STATUSES=['DRAFT','ACTIVE'];
const WORKSPACES=new Set(['data','market','competition','conversion','b2b']);

class MarketProjectError extends Error {
  constructor(message,status=400,code='MARKET_PROJECT_INVALID'){
    super(message);
    this.name='MarketProjectError';
    this.status=status;
    this.code=code;
  }
}

function requiredUuid(value,label='프로젝트'){
  const id=String(value||'').trim();
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)){
    throw new MarketProjectError(`${label}을 다시 선택해주세요.`,400,'INVALID_UUID');
  }
  return id;
}

function projectName(value,productName){
  const name=String(value||`${productName} 시장·전환 분석`).trim();
  if(!name||name.length>120)throw new MarketProjectError('프로젝트 이름은 1~120자로 입력해주세요.');
  return name;
}

function projectHref(projectId,workspace='data'){
  const id=requiredUuid(projectId);
  const target=WORKSPACES.has(workspace)?workspace:'data';
  return `/market-intelligence/${id}/${target}`;
}

function developmentState(project,plans=[]){
  if(!project)return {key:'NOT_STARTED',label:'시작 전',progress:0,plans:0,experiments:0,reports:0,next_label:'프로젝트 만들기'};
  const rows=plans.filter(item=>String(item.project_id)===String(project.id));
  const experiments=rows.filter(item=>item.ab_test_id).length;
  const reports=rows.filter(item=>item.report_generated_at).length;
  if(reports)return {key:'LEARNED',label:'결과 정리',progress:100,plans:rows.length,experiments,reports,next_label:'결과 이어보기'};
  if(experiments)return {key:'VALIDATING',label:'실험 검증 중',progress:82,plans:rows.length,experiments,reports,next_label:'실험 결과 보기'};
  if(rows.length)return {key:'EXPERIMENT_READY',label:'실험 준비',progress:64,plans:rows.length,experiments,reports,next_label:'실행계획 이어보기'};
  if(project.active_version>1)return {key:'RESEARCHING',label:'시장 분석 중',progress:42,plans:0,experiments:0,reports:0,next_label:'분석 이어보기'};
  return {key:'PREPARING',label:'자료 준비',progress:22,plans:0,experiments:0,reports:0,next_label:'자료 채우기'};
}

function buildProjectHome({products=[],projects=[],plans=[]}={}){
  const activeProducts=products.filter(item=>item?.is_active!==false).map(item=>({
    id:String(item.id),
    name:String(item.name||'이름 없는 상품'),
    selling_price:item.selling_price==null?null:Number(item.selling_price)
  }));
  const productMap=new Map(activeProducts.map(item=>[item.id,item]));
  const safeProjects=projects.filter(item=>productMap.has(String(item.master_product_id))).map(item=>({
    id:String(item.id),
    master_product_id:String(item.master_product_id),
    project_name:String(item.project_name||'시장·전환 분석'),
    status:ACTIVE_STATUSES.includes(item.status)?item.status:'ARCHIVED',
    active_version:Math.max(1,Number(item.active_version)||1),
    updated_at:item.updated_at||null,
    last_opened_at:item.last_opened_at||item.updated_at||null,
    product:productMap.get(String(item.master_product_id)),
    href:projectHref(item.id),
    development:developmentState(item,plans)
  })).sort((a,b)=>new Date(b.last_opened_at||0)-new Date(a.last_opened_at||0));
  const latestByProduct=new Map();
  for(const project of safeProjects){
    if(project.status!=='ARCHIVED'&&!latestByProduct.has(project.master_product_id))latestByProduct.set(project.master_product_id,project);
  }
  return {
    products:activeProducts.map(product=>{const project=latestByProduct.get(product.id)||null;return {...product,project,development:developmentState(project,plans)};}),
    projects:safeProjects,
    summary:{
      saleable_products:activeProducts.length,
      active_projects:safeProjects.filter(item=>item.status!=='ARCHIVED').length,
      versions:safeProjects.reduce((sum,item)=>sum+item.active_version,0),
      experiments:safeProjects.reduce((sum,item)=>sum+item.development.experiments,0),
      completed_products:safeProjects.filter(item=>item.development.key==='LEARNED').length
    }
  };
}

async function loadProjectHome({db}){
  const [productsResult,projectsResult,plansResult]=await Promise.all([
    db.from('master_products').select('id,name,selling_price,is_active').eq('is_active',true).order('name'),
    db.from('market_projects').select('id,master_product_id,project_name,status,active_version,last_opened_at,updated_at').order('last_opened_at',{ascending:false}).limit(100),
    db.from('market_execution_plans').select('project_id,master_product_id,approval_status,ab_test_id,report_generated_at').order('updated_at',{ascending:false}).limit(500)
  ]);
  if(productsResult.error)throw productsResult.error;
  if(projectsResult.error)throw projectsResult.error;
  if(plansResult.error)throw plansResult.error;
  return buildProjectHome({products:productsResult.data||[],projects:projectsResult.data||[],plans:plansResult.data||[]});
}

async function createOrOpenProject({db,masterProductId,name,actor='OWNER'}){
  const productId=requiredUuid(masterProductId,'상품');
  const productResult=await db.from('master_products').select('id,name,selling_price,is_active').eq('id',productId).eq('is_active',true).maybeSingle();
  if(productResult.error)throw productResult.error;
  if(!productResult.data)throw new MarketProjectError('판매 중인 기준상품을 찾을 수 없습니다.',404,'ACTIVE_PRODUCT_NOT_FOUND');

  const existingResult=await db.from('market_projects').select('*').eq('master_product_id',productId).in('status',ACTIVE_STATUSES)
    .order('updated_at',{ascending:false}).limit(1).maybeSingle();
  if(existingResult.error)throw existingResult.error;
  if(existingResult.data){
    const touched=await db.from('market_projects').update({last_opened_at:new Date().toISOString()}).eq('id',existingResult.data.id).select('*').single();
    if(touched.error)throw touched.error;
    return {project:touched.data,created:false,href:projectHref(touched.data.id)};
  }

  const now=new Date().toISOString();
  const snapshot={
    master_product_id:productId,
    name:String(productResult.data.name||''),
    selling_price:productResult.data.selling_price==null?null:Number(productResult.data.selling_price),
    captured_at:now
  };
  const row={
    master_product_id:productId,
    project_name:projectName(name,productResult.data.name),
    template_id:foundation.PRODUCT_PROJECT_TEMPLATE.id,
    status:'DRAFT',
    active_version:1,
    product_snapshot:snapshot,
    analysis_config:{market_scope:[],evidence_ids:[],competitor_ids:[],conversion_barriers:[],experiment_ids:[]},
    created_by:String(actor||'OWNER').slice(0,160),
    last_opened_at:now
  };
  const inserted=await db.from('market_projects').insert(row).select('*').single();
  if(inserted.error)throw inserted.error;
  const version=await db.from('market_project_versions').insert({
    project_id:inserted.data.id,
    version_number:1,
    reason:'PROJECT_CREATED',
    snapshot:{project:row,product:snapshot},
    created_by:row.created_by
  }).select('id,version_number').single();
  if(version.error){
    await db.from('market_projects').delete().eq('id',inserted.data.id);
    throw version.error;
  }
  return {project:inserted.data,version:version.data,created:true,href:projectHref(inserted.data.id)};
}

async function loadProject({db,projectId}){
  const id=requiredUuid(projectId);
  const projectResult=await db.from('market_projects').select('*').eq('id',id).maybeSingle();
  if(projectResult.error)throw projectResult.error;
  if(!projectResult.data)throw new MarketProjectError('시장·전환 프로젝트를 찾을 수 없습니다.',404,'PROJECT_NOT_FOUND');
  const [productResult,versionsResult]=await Promise.all([
    db.from('master_products').select('id,name,selling_price,is_active').eq('id',projectResult.data.master_product_id).maybeSingle(),
    db.from('market_project_versions').select('id,version_number,reason,created_at').eq('project_id',id).order('version_number',{ascending:false}).limit(30)
  ]);
  if(productResult.error)throw productResult.error;
  if(versionsResult.error)throw versionsResult.error;
  return {
    project:{...projectResult.data,href:projectHref(id)},
    product:productResult.data||projectResult.data.product_snapshot||null,
    versions:versionsResult.data||[]
  };
}

module.exports={
  ACTIVE_STATUSES,WORKSPACES,MarketProjectError,requiredUuid,projectHref,developmentState,buildProjectHome,
  loadProjectHome,createOrOpenProject,loadProject
};
