import {cookies} from 'next/headers';
import {redirect} from 'next/navigation';
import authModule from '../../lib/dashboard-auth.js';
import featureFlagsModule from '../../lib/ui/phase28-production-runtime.js';
import Phase28RouteShell from '../_phase28/phase28-route-shell.js';

export const dynamic='force-dynamic';

export default async function Layout({children}){
  const cookieStore=await cookies();
  const session=await authModule.validateSession(cookieStore.get(authModule.COOKIE_NAME)?.value).catch(()=>null);
  if(!session)redirect('/login?next=%2Fab-tests');
  const phase28Runtime=featureFlagsModule.phase28RuntimeConfig(process.env,{routeId:'experiments'});
  if(phase28Runtime.activePages.includes('experiments'))return <Phase28RouteShell routeId="experiments">{children}</Phase28RouteShell>;
  return children;
}
