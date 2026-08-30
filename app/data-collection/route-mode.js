import {redirect} from 'next/navigation';
import featureFlagsModule from '../../lib/ui/phase28-production-runtime.js';

const LEGACY_WORKSPACE_TARGET={
  advertising:'connections','execution-paths':'jobs','naver-api':'connections','operations-health':'recovery',
  'optional-providers':'connections','owned-site':'datasets','provider-fallback':'connections','provider-runtime':'jobs','shipping-reference':'datasets'
};

export function redirectLegacySystemWorkspace(legacyWorkspace){
  const runtime=featureFlagsModule.phase28RuntimeConfig(process.env,{routeId:'system'});
  const workspace=LEGACY_WORKSPACE_TARGET[legacyWorkspace]||'connections';
  if(runtime.activePages.includes('system'))redirect(workspace==='connections'?'/data-collection':`/data-collection?workspace=${workspace}`);
}
