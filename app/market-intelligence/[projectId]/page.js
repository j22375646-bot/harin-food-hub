import { redirect } from 'next/navigation';
import projectsModule from '../../../lib/market-intelligence/projects.js';

export const dynamic='force-dynamic';

export default async function Page({params}){
  const {projectId}=await params;
  redirect(projectsModule.projectHref(projectId,'data'));
}
