import HarinIcon from './harin-icon.js';

const join=(...values)=>values.filter(Boolean).join(' ');

export function HarinPictogram({ icon='sparkles', tone='lavender', label, size=20, className='' }) {
  return <span className={join('v8Pictogram',`v8Pictogram-${tone}`,className)} aria-label={label}><HarinIcon name={icon} size={size}/></span>;
}

export function HarinCard({ as:Element='article', tone='plain', interactive=false, className='', children, ...props }) {
  return <Element className={join('v8Card',`v8Card-${tone}`,interactive&&'v8Card-interactive',className)} {...props}>{children}</Element>;
}

export function HarinButton({ as:Element='button', variant='secondary', size='medium', icon, children, className='', type, ...props }) {
  const elementProps=Element==='button'?{type:type||'button'}:{};
  return <Element className={join('v8Button',`v8Button-${variant}`,`v8Button-${size}`,className)} {...elementProps} {...props}>{icon?<HarinIcon name={icon} size={18}/>:null}<span>{children}</span></Element>;
}

export function HarinBadge({ tone='neutral', icon, children, className='', ...props }) {
  return <span className={join('v8Badge',`v8Badge-${tone}`,className)} {...props}>{icon?<HarinIcon name={icon} size={14}/>:null}{children}</span>;
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

export function HarinPageContent({ as:Element='div', className='', children, ...props }) {
  return <Element className={join('v8PageContent',className)} {...props}>{children}</Element>;
}

export function HarinProgressiveDetails({ eyebrow='상세 운영', title, description, count, action='열기', className='', children, defaultOpen=false, ...props }) {
  if(!children)return null;
  return <details className={join('v8ProgressiveDetails',className)} open={defaultOpen||undefined} {...props}>
    <summary>
      <span className="v8ProgressiveDetailsIcon"><HarinIcon name="chevron" size={18}/></span>
      <span className="v8ProgressiveDetailsCopy"><small>{eyebrow}</small><b>{title}</b>{description?<em>{description}</em>:null}</span>
      {count!=null?<strong>{count}</strong>:null}
      <span className="v8ProgressiveDetailsAction">{action}</span>
    </summary>
    <div className="v8ProgressiveDetailsBody">{children}</div>
  </details>;
}

export function HarinPageAiRegion({ title='이 페이지의 AI 분석', description='현재 화면의 자료만 따로 분석하며 다른 페이지 결과와 합치지 않아요.', className='', children, ...props }) {
  if(!children)return null;
  return <section className={join('v8PageAiRegion',className)} {...props}>
    <header><HarinPictogram icon="sparkles" tone="lavender" size={18}/><span><b>{title}</b><small>{description}</small></span></header>
    <div>{children}</div>
  </section>;
}

export function HarinEmptyState({ icon='sparkles', title='표시할 자료가 없어요', description, action, className='' }) {
  return <section className={join('v8EmptyState',className)}><HarinPictogram icon={icon} tone="lavender" size={22}/><div><b>{title}</b>{description?<p>{description}</p>:null}</div>{action||null}</section>;
}

export function HarinStateCard({ tone='neutral', icon='shield', label, value, description, className='' }) {
  return <HarinCard className={join('v8StateCard',`v8StateCard-${tone}`,className)}><HarinPictogram icon={icon} tone={tone==='success'?'mint':tone==='danger'?'pink':tone==='warning'?'amber':'lavender'} size={19}/><div><small>{label}</small><b>{value}</b>{description?<p>{description}</p>:null}</div></HarinCard>;
}

export { HarinIcon };
