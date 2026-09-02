import {cookies,headers} from 'next/headers';
import {redirect} from 'next/navigation';
import authModule from '../../lib/dashboard-auth.js';
import featureFlagsModule from '../../lib/ui/phase28-production-runtime.js';
import Phase28RouteShell from '../_phase28/phase28-route-shell.js';

export const dynamic='force-dynamic';

export default async function Layout({children}){
  const [cookieStore,requestHeaders]=await Promise.all([cookies(),headers()]);
  const session=await authModule.resolveRequestSession({headers:requestHeaders,token:cookieStore.get(authModule.COOKIE_NAME)?.value});
  if(!session)redirect('/login?next=%2Fexecution-validation');
  const phase28Runtime=featureFlagsModule.phase28RuntimeConfig(process.env,{routeId:'validation'});
  if(phase28Runtime.activePages.includes('validation'))return <Phase28RouteShell routeId="validation">{children}</Phase28RouteShell>;
  return children;
}
