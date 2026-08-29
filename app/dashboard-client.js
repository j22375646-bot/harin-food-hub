'use client';

import dynamic from 'next/dynamic';
import rootSelectionModule from '../lib/ui/phase28-root-selection.js';
import Phase28Loading from './_phase28/phase28-loading.js';

const {selectPhase28Root}=rootSelectionModule;
const LegacyDashboard=dynamic(()=>import('./legacy-dashboard-client.js'),{loading:Phase28Loading});
const Phase28App=dynamic(()=>import('./_phase28/phase28-app.js'),{loading:Phase28Loading});

export default function Dashboard(props) {
  const renderMode=props.initialData?.phase28Runtime?.renderMode||'legacy';
  return selectPhase28Root(renderMode)==='phase28'
    ?<Phase28App {...props}/>
    :<LegacyDashboard {...props}/>;
}
