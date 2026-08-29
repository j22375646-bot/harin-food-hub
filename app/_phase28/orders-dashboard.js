'use client';

import HarinIcon from '../_design-system/harin-icon.js';
import Phase28OperationalDashboard,{Phase28ChannelRows,Phase28ChannelLogo} from './operational-dashboard.js';

const workspaceIcon={ACTIVE:'orders',EPOST:'truck',REGISTER:'approvals',IN_TRANSIT:'sync',COMPLETED:'shield',RETRY:'alerts'};

function OrderFlow({items=[],window={}}){
  return <div className="phase28RailFlow">
    <header><span>오늘의 출고 레일</span><h2>막힌 단계부터 확인하세요</h2><p>수량은 서버가 확인한 현재 주문을 기준으로 표시합니다.</p></header>
    <ol>{items.map(item=><li key={item.id}><span><HarinIcon name={workspaceIcon[item.id]||'orders'} size={18}/></span><div><strong>{item.label}</strong><small>{item.description}</small></div><em className={item.status==='CHECK_REQUIRED'?'check':''}>{item.count==null?'확인 필요':`${item.count.toLocaleString('ko-KR')}건`}</em></li>)}</ol>
    <p className="phase28RailNote">완료 이력은 {window.days||30}일만 작업목록에 표시하고 누적 기록은 그대로 보존합니다.</p>
  </div>;
}

function OrderPriorities({items=[]}){
  if(!items.length)return <p className="phase28OperationalEmpty">지금 바로 출고할 판매자배송 주문은 없어요.</p>;
  return <div className="phase28RailPriorityRows">{items.map(item=><article key={item.id}>
    <Phase28ChannelLogo platform={item.platform} size="compact"/>
    <span><strong>{item.productName}</strong><small>{item.id}</small></span>
    <em className={item.timingType==='DELAYED'?'urgent':'calm'}>{item.cancellationRequested?'출고 멈춤':item.timingLabel}</em>
  </article>)}</div>;
}

export default function Phase28OrdersDashboard({model={},aiPanel,children}){
  const hero=model.hero||{};
  const workspaces=model.workspaces||[];
  const pulseItems=workspaces.filter(item=>item.id!=='RETRY').map((item,index)=>({
    id:item.id,
    icon:workspaceIcon[item.id],
    kicker:`${index+1}단계`,
    label:item.label,
    value:`${Number(item.count||0).toLocaleString('ko-KR')}건`,
    tone:item.id==='ACTIVE'&&hero.delayedCount?'urgent':item.id==='COMPLETED'?'complete':'calm'
  }));
  const tabs=[
    {id:'flow',label:'출고 흐름',content:<OrderFlow items={workspaces} window={model.window}/>},
    {id:'priority',label:'먼저 볼 주문',content:<OrderPriorities items={model.priorities}/>},
    {id:'channels',label:'수집 상태',content:<><header className="phase28RailPanelHeader"><span>채널 연결</span><h2>세 채널을 따로 확인해요</h2><p>연결 실패를 다른 채널의 정상 상태와 섞지 않습니다.</p></header><Phase28ChannelRows channels={model.channels}/></>},
    {id:'ai',label:'주문·배송 AI',content:aiPanel||<p className="phase28OperationalEmpty">분석 근거를 준비하고 있어요.</p>}
  ];
  return <Phase28OperationalDashboard
    kind="orders"
    context="채널별 주문 최신 상태 · 판매자배송만 작업"
    titleBefore="오늘 출고할 주문은 "
    titleAccent={`${Number(hero.workCount||0).toLocaleString('ko-KR')}건`}
    titleAfter="이에요."
    summary={hero.summary||'취소 주문과 로켓그로스를 분리하고 직접 보낼 주문만 모았습니다.'}
    asOf={hero.asOf}
    heroFact={{label:'가장 먼저',value:`배송지연 ${Number(hero.delayedCount||0).toLocaleString('ko-KR')}건`,description:hero.cancellationCount?`출고 전 취소 요청 ${hero.cancellationCount.toLocaleString('ko-KR')}건도 확인하세요.`:'출고 중단 요청은 없습니다.',tone:hero.delayedCount?'urgent':'calm'}}
    pulseLabel="오늘의 출고 레일"
    pulseItems={pulseItems}
    tabs={tabs}
    railLabel="출고 보조석"
  >{children}</Phase28OperationalDashboard>;
}
