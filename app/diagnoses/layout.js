import {cookies,headers} from 'next/headers';
import {redirect} from 'next/navigation';
import authModule from '../../lib/dashboard-auth.js';
import featureFlagsModule from '../../lib/ui/phase28-production-runtime.js';
import Phase28RouteShell from '../_phase28/phase28-route-shell.js';

export const dynamic='force-dynamic';

export default async function Layout({children}){
  const [cookieStore,requestHeaders]=await Promise.all([cookies(),headers()]);
  const session=await authModule.resolveRequestSession({headers:requestHeaders,token:cookieStore.get(authModule.COOKIE_NAME)?.value});
  if(!session)redirect('/login?next=%2Fdiagnoses');
  const phase28Runtime=featureFlagsModule.phase28RuntimeConfig(process.env,{routeId:'diagnoses'});
  if(phase28Runtime.activePages.includes('diagnoses'))return <Phase28RouteShell routeId="diagnoses">{children}</Phase28RouteShell>;
  return children;
}
