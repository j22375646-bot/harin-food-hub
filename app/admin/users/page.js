import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import authModule from '../../../lib/dashboard-auth.js';
import UserManagement from './user-management.js';

export const dynamic = 'force-dynamic';

export default async function UsersPage() {
  const store=await cookies();
  const session=await authModule.validateSession(store.get(authModule.COOKIE_NAME)?.value).catch(()=>null);
  if(!session)redirect('/login?next=/admin/users');
  if(session.role!=='OWNER')redirect('/');
  return <UserManagement currentUser={session}/>;
}
