import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import '../_analysis/harin-market-intelligence.css';
import authModule from '../../lib/dashboard-auth.js';
import featureFlagsModule from '../../lib/ui/phase28-production-runtime.js';
import Phase28Shell from '../_phase28/phase28-shell.js';
import MarketIntelligenceShell from '../_shell/market-intelligence-shell.js';

export const dynamic='force-dynamic';

export default async function Layout({children}){
  const cookieStore=await cookies();
  const session=await authModule.validateSession(cookieStore.get(authModule.COOKIE_NAME)?.value).catch(()=>null);
  if(!session)redirect('/login?next=%2Fmarket-intelligence');
  const phase28Runtime=featureFlagsModule.phase28RuntimeConfig(process.env,{routeId:'development'});
  if(phase28Runtime.activePages.includes('development'))return <Phase28Shell routeId="development" generatedAt={null}>{children}</Phase28Shell>;
  return <MarketIntelligenceShell>{children}</MarketIntelligenceShell>;
}
