import {redirect} from 'next/navigation';
import featureFlagsModule from '../../lib/ui/phase28-production-runtime.js';

export function redirectLegacySystemWorkspace(){
  const runtime=featureFlagsModule.phase28RuntimeConfig(process.env,{routeId:'system'});
  if(runtime.activePages.includes('system'))redirect('/data-collection');
}
