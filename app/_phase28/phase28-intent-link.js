'use client';

import Link from 'next/link';
import {useState} from 'react';

export function Phase28IntentLink({prefetchPolicy=null,onMouseEnter,onFocus,onTouchStart,...props}) {
  const [intentDetected,setIntentDetected]=useState(false);
  const canPrefetch=prefetchPolicy!==false;

  function prepareRoute() {
    if(canPrefetch)setIntentDetected(true);
  }

  return <Link
    {...props}
    prefetch={canPrefetch?(intentDetected?true:false):false}
    onMouseEnter={event=>{prepareRoute();onMouseEnter?.(event);}}
    onFocus={event=>{prepareRoute();onFocus?.(event);}}
    onTouchStart={event=>{prepareRoute();onTouchStart?.(event);}}
  />;
}
