'use client';

import { useState } from 'react';
import HarinIcon from './harin-icon.js';
import brandSystem from '../../lib/ui/brand-system.js';
import visualizationModule from '../../lib/ui/visualization.js';

const join=(...values)=>values.filter(Boolean).join(' ');
const { resolveStatusTone }=brandSystem;
const { buildChartModel, buildWaterfallModel }=visualizationModule;

export function HarinPictogram({ icon='sparkles', tone='lavender', label, size=20, className='' }) {
  return <span className={join('v8Pictogram',`v8Pictogram-${tone}`,className)} aria-label={label}><HarinIcon name={icon} size={size}/></span>;
}

export function HarinCard({ as:Element='article', tone='plain', interactive=false, className='', children, ...props }) {
  return <Element className={join('v8Card',`v8Card-${tone}`,interactive&&'v8Card-interactive',className)} {...props}>{children}</Element>;
}

export function HarinButton({ as:Element='button', variant='secondary', size='medium', icon, busy=false, busyLabel='처리 중…', children, className='', type, disabled, ...props }) {
  const elementProps=Element==='button'?{type:type||'button'}:{};
  const busyProps=busy?{'aria-busy':'true','aria-live':'polite'}:{};
  return <Element className={join('v8Button',`v8Button-${variant}`,`v8Button-${size}`,busy&&'v8Button-busy',className)} disabled={Element==='button'?(disabled||busy):undefined} {...elementProps} {...busyProps} {...props}>{busy?<span className="v8ButtonSpinner" aria-hidden="true"/>:icon?<HarinIcon name={icon} size={18}/>:null}<span>{busy?busyLabel:children}</span></Element>;
}

export function HarinBadge({ tone='neutral', status, icon, children, className='', ...props }) {
  const resolvedTone=status?resolveStatusTone(status,tone):tone;
  return <span className={join('v8Badge',`v8Badge-${resolvedTone}`,className)} data-status-tone={resolvedTone} {...props}>{icon?<HarinIcon name={icon} size={14}/>:null}{children}</span>;
}

export function HarinSectionHeading({ eyebrow, title, description, aside, icon, className='' }) {
  return <header className={join('v8SectionHeading',className)}>
    <div className="v8SectionHeadingCopy">{icon?<HarinPictogram icon={icon} tone="lavender" size={19}/>:null}<span>{eyebrow?<small>{eyebrow}</small>:null}<h2>{title}</h2>{description?<p>{description}</p>:null}</span></div>
    {aside?<div className="v8SectionHeadingAside">{aside}</div>:null}
  </header>;
}

export function HarinPageFrame({ as:Element='section', kind='default', className='', children, ...props }) {
  return <Element className={join('v8PageFrame',`v8PageFrame-${kind}`,className)} {...props}>{children}</Element>;
}

export function HarinPageHeader({ eyebrow, title, description, icon='sparkles', tone='lavender', note, metrics=[], actions, className='' }) {
  return <header className={join('v8PageHeader',`v8PageHeader-${tone}`,className)}>
    <div className="v8PageHeaderCopy">
      <span className="v8PageHeaderEyebrow">{eyebrow}</span>
      <div><HarinPictogram icon={icon} tone={tone} size={24}/><span><h1>{title}</h1>{description?<p>{description}</p>:null}</span></div>
      {note?<small className="v8PageHeaderNote">{note}</small>:null}
    </div>
    {metrics.length?<div className="v8PageHeaderMetrics">{metrics.map((metric,index)=>{const item=Array.isArray(metric)?{label:metric[0],value:metric[1],description:metric[2],tone:metric[3]}:metric;return <span className={item.tone||''} key={`${item.label}-${index}`}><small>{item.label}</small><b>{item.value}</b>{item.description?<em>{item.description}</em>:null}</span>;})}</div>:null}
    {actions?<div className="v8PageHeaderActions">{actions}</div>:null}
  </header>;
}

export function HarinPageToolbar({ label='보기 조건', description, aside, className='', children }) {
  return <section className={join('v8PageToolbar',className)}>
    <header><span><b>{label}</b>{description?<small>{description}</small>:null}</span>{aside?<aside>{aside}</aside>:null}</header>
    <div className="v8PageToolbarBody">{children}</div>
  </section>;
}

export function HarinQuickAction({ as:Element='a', href, icon='sparkles', tone='lavender', eyebrow, title, active=false, className='', children, ...props }) {
  const elementProps=href?{href}:{};
  return <Element className={join('v8QuickAction',`v8QuickAction-${tone}`,active&&'active',className)} aria-current={active?'page':undefined} {...elementProps} {...props}>
    <HarinPictogram icon={icon} tone={tone} size={21}/>
    <span>{eyebrow?<small>{eyebrow}</small>:null}<b>{title||children}</b></span>
    <HarinIcon className="v8QuickActionArrow" name="chevron" size={17}/>
  </Element>;
}

export function HarinInlineStatus({ tone='neutral', status, icon, title, description, action, busy=false, className='', ...props }) {
  const resolvedTone=status?resolveStatusTone(status,tone):tone;
  const statusIcon=icon||(busy?'sync':resolvedTone==='success'?'check':resolvedTone==='danger'?'warning':resolvedTone==='warning'?'clock':'sparkles');
  return <section className={join('v8InlineStatus',`v8InlineStatus-${resolvedTone}`,busy&&'v8InlineStatus-busy',className)} data-status-tone={resolvedTone} role="status" aria-live="polite" aria-busy={busy?'true':undefined} {...props}>
    <HarinPictogram icon={statusIcon} tone={resolvedTone==='success'?'mint':resolvedTone==='danger'?'pink':resolvedTone==='warning'?'amber':resolvedTone==='info'?'blue':'lavender'} size={18}/>
    <span><b>{title}</b>{description?<small>{description}</small>:null}</span>
    {action?<div>{action}</div>:null}
  </section>;
}

export function HarinRouteProgress({ label='다음', description='현재 화면은 그대로 두고 필요한 자료만 바꿉니다.' }) {
  return <section className="viewLoadingRibbon" role="status" aria-live="polite" aria-atomic="true">
    <span className="viewLoadingSpinner" aria-hidden="true"/>
    <span className="viewLoadingCopy"><b>{label} 화면을 여는 중이에요</b><small>{description}</small></span>
    <span className="viewLoadingProgress" aria-hidden="true"><i/></span>
  </section>;
}

export function HarinPageContent({ as:Element='div', className='', children, ...props }) {
  return <Element className={join('v8PageContent',className)} {...props}>{children}</Element>;
}

export function HarinProgressiveDetails({ eyebrow='상세 운영', title, description, count, action='열기', className='', children, defaultOpen=false, lazy=true, onToggle, ...props }) {
  const [open,setOpen]=useState(Boolean(defaultOpen));
  const [contentMounted,setContentMounted]=useState(Boolean(defaultOpen)||!lazy);
  if(!children)return null;
  const handleToggle=event=>{
    const nextOpen=event.currentTarget.open;
    setOpen(nextOpen);
    if(nextOpen&&!contentMounted)setContentMounted(true);
    onToggle?.(event);
  };
  return <details className={join('v8ProgressiveDetails',className)} open={open} onToggle={handleToggle} data-content-mounted={contentMounted?'true':'false'} {...props}>
    <summary>
      <span className="v8ProgressiveDetailsIcon"><HarinIcon name="chevron" size={18}/></span>
      <span className="v8ProgressiveDetailsCopy"><small>{eyebrow}</small><b>{title}</b>{description?<em>{description}</em>:null}</span>
      {count!=null?<strong>{count}</strong>:null}
      <span className="v8ProgressiveDetailsAction">{action}</span>
    </summary>
    {contentMounted?<div className="v8ProgressiveDetailsBody">{children}</div>:null}
  </details>;
}

export function HarinPageAiRegion({ title='이 페이지의 AI 분석', description='현재 화면의 자료만 따로 분석하며 다른 페이지 결과와 합치지 않아요.', className='', children, ...props }) {
  if(!children)return null;
  return <section className={join('v8PageAiRegion',className)} {...props}>
    <header><HarinPictogram icon="sparkles" tone="lavender" size={18}/><span><b>{title}</b><small>{description}</small></span></header>
    <div>{children}</div>
  </section>;
}

export function HarinEmptyState({ state='empty', icon, title, description, action, trend, trendLabel='최근 7일 접수', className='' }) {
  const resolvedState=['empty','uncollected','error'].includes(state)?state:'empty';
  const meta={
    empty:{icon:'check',tone:'mint',title:'지금 처리할 항목이 없어요'},
    uncollected:{icon:'download',tone:'amber',title:'아직 수집된 자료가 없어요'},
    error:{icon:'warning',tone:'pink',title:'자료를 불러오지 못했어요'},
  }[resolvedState];
  const trendValues=Array.isArray(trend)?trend:[];
  return <section className={join('v8EmptyState',`v8EmptyState-${resolvedState}`,trendValues.length&&'v8EmptyState-withTrend',className)} data-empty-state={resolvedState}>
    <HarinPictogram icon={icon||meta.icon} tone={meta.tone} size={22}/>
    <div><b>{title||meta.title}</b>{description?<p>{description}</p>:null}</div>
    {trendValues.length?<HarinMetricChart className="v8EmptyStateTrend" compact kind="line" title={trendLabel} labels={trendValues.map(item=>item.label)} series={[{label:'접수',tone:'blue',values:trendValues.map(item=>item.value)}]}/>:null}
    {action?<div className="v8EmptyStateAction">{action}</div>:null}
  </section>;
}

function chartSegments(values,max,width,height,padding) {
  const count=Math.max(values.length,1);
  const points=values.map((value,index)=>value==null?null:{
    x:padding+(count===1?(width-padding*2)/2:index*(width-padding*2)/(count-1)),
    y:height-padding-(Math.abs(value)/max)*(height-padding*2),
    value,
  });
  const segments=[];
  let current=[];
  for(const point of points){
    if(point)current.push(point);
    else if(current.length){segments.push(current);current=[];}
  }
  if(current.length)segments.push(current);
  return {points,segments};
}

export function HarinMetricChart({ kind='line', title, description, labels=[], series=[], compact=false, valueFormatter=(value)=>Number(value).toLocaleString('ko-KR'), className='' }) {
  const model=buildChartModel({labels,series});
  if(model.status==='UNCOLLECTED')return <HarinEmptyState state="uncollected" title={`${title||'차트'} 자료가 아직 없어요`} description="수집이 끝나면 확인된 값만 표시합니다. 비어 있는 값은 0으로 바꾸지 않아요." className={className}/>;
  const width=640,height=compact?104:190,padding=compact?12:24;
  const chartLabel=`${title||'지표 차트'} · ${model.series.map(item=>`${item.label} ${item.values.map(value=>value==null?'확인 필요':valueFormatter(value)).join(', ')}`).join(' · ')}`;
  return <figure className={join('v8MetricChart',`v8MetricChart-${kind}`,compact&&'compact',model.hasMissingEvidence&&'hasMissingEvidence',className)} data-chart-kind={kind}>
    <figcaption><span><b>{title}</b>{description?<small>{description}</small>:null}</span>{model.hasMissingEvidence?<em>일부 자료 확인 필요</em>:null}</figcaption>
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={chartLabel} preserveAspectRatio="none">
      <line className="v8ChartBaseline" x1={padding} x2={width-padding} y1={height-padding} y2={height-padding}/>
      {kind==='bar'?model.series.flatMap((item,seriesIndex)=>item.values.map((value,index)=>{
        if(value==null)return null;
        const groupWidth=(width-padding*2)/Math.max(model.labels.length,1);
        const barWidth=Math.max(4,Math.min(26,(groupWidth-8)/Math.max(model.series.length,1)));
        const barHeight=Math.abs(value)/model.max*(height-padding*2);
        const x=padding+index*groupWidth+(groupWidth-barWidth*model.series.length)/2+seriesIndex*barWidth;
        return <rect className={`v8ChartSeries-${item.tone}`} x={x} y={height-padding-barHeight} width={Math.max(2,barWidth-2)} height={barHeight} rx="3" key={`${item.id}-${index}`}><title>{model.labels[index]} · {item.label} {valueFormatter(value)}</title></rect>;
      })):model.series.flatMap(item=>{
        const chart=chartSegments(item.values,model.max,width,height,padding);
        return <g className={`v8ChartSeries-${item.tone}`} key={item.id}>{chart.segments.map((segment,index)=><polyline points={segment.map(point=>`${point.x},${point.y}`).join(' ')} key={`${item.id}-line-${index}`}/>)}{chart.points.map((point,index)=>point?<circle cx={point.x} cy={point.y} r={compact?3:4} key={`${item.id}-point-${index}`}><title>{model.labels[index]} · {item.label} {valueFormatter(point.value)}</title></circle>:null)}</g>;
      })}
    </svg>
    {!compact?<><div className="v8ChartLabels">{model.labels.map((label,index)=><span key={`${label}-${index}`}>{label}</span>)}</div><div className="v8ChartLegend">{model.series.map(item=><span key={item.id}><i className={`v8ChartSeries-${item.tone}`}/>{item.label}</span>)}</div></>:null}
  </figure>;
}

export function HarinWaterfallChart({ title, description, items=[], footer, valueFormatter=(value)=>`${Math.round(Number(value)).toLocaleString('ko-KR')}원`, className='' }) {
  const model=buildWaterfallModel(items);
  if(model.status==='UNCOLLECTED')return <HarinEmptyState state="uncollected" icon="settlement" title={`${title||'정산 흐름'} 자료가 아직 없어요`} description="채널 정산 자료가 들어오면 매출부터 예상 정산액까지 순서대로 표시합니다." className={className}/>;
  return <section className={join('v8WaterfallChart',model.hasMissingEvidence&&'hasMissingEvidence',className)}>
    <header><span><h2>{title}</h2>{description?<p>{description}</p>:null}</span>{model.hasMissingEvidence?<em>확인되지 않은 금액 포함</em>:null}</header>
    <div className="v8WaterfallSteps">{model.items.map((item,index)=><article className={join(`v8Waterfall-${item.tone||'neutral'}`,item.displayStatus==='CHECK_REQUIRED'&&'checkRequired')} key={item.id}>
      <span><small>{String(index+1).padStart(2,'0')}</small><b>{item.label}</b>{item.description?<em>{item.description}</em>:null}</span>
      <i aria-hidden="true"><span style={{'--v8-waterfall-ratio':item.value==null?0:Math.abs(item.value)/model.max}}/></i>
      <strong>{item.value==null?'확인 필요':valueFormatter(item.value)}</strong>
    </article>)}</div>
    {footer?<footer>{footer}</footer>:null}
  </section>;
}

export function HarinDonutChart({ title, description, items=[], valueFormatter=(value)=>`${Math.round(Number(value)).toLocaleString('ko-KR')}원`, className='' }) {
  const normalized=(Array.isArray(items)?items:[]).slice(0,5).map((item,index)=>({
    ...item,
    id:item.id||`donut-${index+1}`,
    value:item.value===null||item.value===undefined||item.value===''?null:Number(item.value),
    tone:item.tone||['blue','lavender','amber','mint','pink'][index%5],
  })).filter(item=>Number.isFinite(item.value)&&item.value>=0);
  const total=normalized.reduce((sum,item)=>sum+item.value,0);
  if(!normalized.length)return <HarinEmptyState state="uncollected" title={`${title||'채널 비중'} 자료가 아직 없어요`} description="비교 가능한 확정 또는 예상 금액이 들어오면 비중을 표시합니다." className={className}/>;
  const radius=52,circumference=2*Math.PI*radius;
  let cursor=0;
  return <figure className={join('v8DonutChart',className)}>
    <figcaption><b>{title}</b>{description?<small>{description}</small>:null}</figcaption>
    <div><svg viewBox="0 0 140 140" role="img" aria-label={`${title||'채널 비중'} · ${normalized.map(item=>`${item.label} ${valueFormatter(item.value)}`).join(' · ')}`}>
      <circle className="v8DonutTrack" cx="70" cy="70" r={radius}/>
      {normalized.map(item=>{const length=total>0?item.value/total*circumference:0;const offset=-cursor;cursor+=length;return <circle className={`v8DonutSegment v8ChartSeries-${item.tone}`} cx="70" cy="70" r={radius} strokeDasharray={`${length} ${circumference-length}`} strokeDashoffset={offset} key={item.id}><title>{item.label} · {valueFormatter(item.value)}</title></circle>;})}
      <text x="70" y="64" textAnchor="middle">합계</text><text className="value" x="70" y="84" textAnchor="middle">{total>0?valueFormatter(total):'0원'}</text>
    </svg><ul>{normalized.map(item=><li key={item.id}><i className={`v8ChartSeries-${item.tone}`}/><span><b>{item.label}</b><small>{total>0?`${(item.value/total*100).toFixed(1)}%`:'0.0%'}</small></span><strong>{valueFormatter(item.value)}</strong></li>)}</ul></div>
  </figure>;
}

export function HarinStateCard({ tone='neutral', status, icon='shield', label, value, description, className='' }) {
  const resolvedTone=status?resolveStatusTone(status,tone):tone;
  return <HarinCard className={join('v8StateCard',`v8StateCard-${resolvedTone}`,className)} data-status-tone={resolvedTone}><HarinPictogram icon={icon} tone={resolvedTone==='success'?'mint':resolvedTone==='danger'?'pink':resolvedTone==='warning'?'amber':'lavender'} size={19}/><div><small>{label}</small><b>{value}</b>{description?<p>{description}</p>:null}</div></HarinCard>;
}

export { HarinIcon };
