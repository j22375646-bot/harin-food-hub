import {redirect} from 'next/navigation';
import featureFlagsModule from '../../lib/ui/feature-flags.js';

export function redirectLegacySystemWorkspace(){
  const runtime=featureFlagsModule.phase28RuntimeConfig(process.env,{routeId:'system'});
  if(runtime.activePages.includes('system'))redirect('/data-collection');
}
