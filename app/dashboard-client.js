'use client';

import dynamic from 'next/dynamic';
import Phase28Loading from './_phase28/phase28-loading.js';

const Phase28App=dynamic(()=>import('./_phase28/phase28-app.js'),{loading:Phase28Loading});

export default function Dashboard(props) {
  return <Phase28App {...props}/>;
}
