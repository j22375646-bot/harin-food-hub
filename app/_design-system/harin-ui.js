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

export function HarinEmptyState({ icon='sparkles', title='표시할 자료가 없어요', description, action, className='' }) {
  return <section className={join('v8EmptyState',className)}><HarinPictogram icon={icon} tone="lavender" size={22}/><div><b>{title}</b>{description?<p>{description}</p>:null}</div>{action||null}</section>;
}

export function HarinStateCard({ tone='neutral', icon='shield', label, value, description, className='' }) {
  return <HarinCard className={join('v8StateCard',`v8StateCard-${tone}`,className)}><HarinPictogram icon={icon} tone={tone==='success'?'mint':tone==='danger'?'pink':tone==='warning'?'amber':'lavender'} size={19}/><div><small>{label}</small><b>{value}</b>{description?<p>{description}</p>:null}</div></HarinCard>;
}

export { HarinIcon };
