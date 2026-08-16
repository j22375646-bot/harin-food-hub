import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import authModule from '../../lib/dashboard-auth.js';
import MarketIntelligenceShell from '../_shell/market-intelligence-shell.js';

export const dynamic='force-dynamic';

export default async function Layout({children}){
  const cookieStore=await cookies();
  const session=await authModule.validateSession(cookieStore.get(authModule.COOKIE_NAME)?.value).catch(()=>null);
  if(!session)redirect('/login?next=%2Fmarket-intelligence');
  return <MarketIntelligenceShell>{children}</MarketIntelligenceShell>;
}
