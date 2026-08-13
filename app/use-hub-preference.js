'use client';

import { useEffect, useState } from 'react';

const PREFIX='harin-hub:';

export function useStoredState(key, fallback, allowedValues=null) {
  const [value,setValue]=useState(fallback);
  const [restored,setRestored]=useState(false);

  useEffect(()=>{
    try{
      const raw=window.localStorage.getItem(`${PREFIX}${key}`);
      if(raw!==null){
        const stored=JSON.parse(raw);
        if(!allowedValues||allowedValues.includes(stored))setValue(stored);
      }
    }catch{}
    setRestored(true);
  },[key]);

  useEffect(()=>{
    if(!restored)return;
    try{window.localStorage.setItem(`${PREFIX}${key}`,JSON.stringify(value));}catch{}
  },[key,value,restored]);

  return [value,setValue];
}
