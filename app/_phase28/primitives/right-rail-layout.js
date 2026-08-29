'use client';

import {useId,useState} from 'react';
import styles from './primitives.module.css';

export function Phase28RightRailLayout({label='보조 작업석',rail,children,defaultOpen=true}) {
  const [open,setOpen]=useState(defaultOpen);
  const contentId=useId();
  return <div className={styles.workspace} data-open={open?'true':'false'}>
    <div className={styles.workspaceMain}>{children}</div>
    <aside className={styles.rail} aria-label={label}>
      <button type="button" className={styles.railControl} aria-expanded={open} aria-controls={contentId} onClick={()=>setOpen(value=>!value)}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>
        <b>{open?`${label} 접기`:`${label} 열기`}</b>
      </button>
      <div id={contentId} className={styles.railContent} aria-hidden={!open} inert={open?undefined:''}>{rail}</div>
    </aside>
  </div>;
}
