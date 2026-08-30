import {cookies} from 'next/headers';
import {redirect} from 'next/navigation';
import authModule from '../../lib/dashboard-auth.js';
import featureFlagsModule from '../../lib/ui/feature-flags.js';
import Phase28Shell from '../_phase28/phase28-shell.js';

export const dynamic='force-dynamic';

export default async function Layout({children}){
  const cookieStore=await cookies();
  const session=await authModule.validateSession(cookieStore.get(authModule.COOKIE_NAME)?.value).catch(()=>null);
  if(!session)redirect('/login?next=%2Fai-knowledge');
  const phase28Runtime=featureFlagsModule.phase28RuntimeConfig(process.env,{routeId:'knowledge'});
  if(phase28Runtime.activePages.includes('knowledge'))return <Phase28Shell routeId="knowledge" generatedAt={null}>{children}</Phase28Shell>;
  return children;
}
