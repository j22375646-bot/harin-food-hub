import routeHandler from '../../../../../lib/operations-health/route-handler.js';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function POST(request){return routeHandler.handleProbe(request,'AWS_CLOUDWATCH');}
