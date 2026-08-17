import routeHandler from '../../../../../lib/optional-providers/route-handler.js';

export const runtime='nodejs';
export const dynamic='force-dynamic';

export async function POST(request){return routeHandler.handleDeepLProbe(request);}
