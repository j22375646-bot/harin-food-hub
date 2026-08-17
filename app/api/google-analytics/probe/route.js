import routeHandler from '../../../../lib/google-owned-site/route-handler.js';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function POST(request){return routeHandler.handleProbe(request,'GA4');}
