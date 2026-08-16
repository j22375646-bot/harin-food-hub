import { renderMarketWorkspace } from '../workspace-page.js';
export const dynamic='force-dynamic';
export default async function Page({params}){const {projectId}=await params;return renderMarketWorkspace({projectId,workspace:'market'});}
