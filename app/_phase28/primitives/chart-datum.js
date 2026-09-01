'use client';

import styles from './chart-datum.module.css';

export function Phase28ChartDatum({
  as='span',label,value,children,className='',placement='top',edge='middle',onPointerDown,...props
}){
  const Element=as==='button'?'button':'span';
  const accessibleLabel=[label,value].filter(item=>item!==''&&item!=null).join(' ');
  function revealOnTouch(event){
    onPointerDown?.(event);
    if(event.pointerType==='touch'||event.pointerType==='pen')event.currentTarget.focus({preventScroll:true});
  }
  return <Element
    {...props}
    {...(Element==='button'?{type:props.type||'button'}:{role:props.role||'img'})}
    className={[styles.datum,className].filter(Boolean).join(' ')}
    data-chart-datum="true"
    data-tooltip-placement={placement}
    data-tooltip-edge={edge}
    tabIndex={props.tabIndex??0}
    aria-label={props['aria-label']||accessibleLabel}
    onPointerDown={revealOnTouch}
  >
    {children}
    <em className={styles.tooltip} role="tooltip" aria-hidden="true">
      <span className={styles.tooltipLabel}>{label}</span>
      {value!==''&&value!=null?<strong className={styles.tooltipValue}>{value}</strong>:null}
    </em>
  </Element>;
}
