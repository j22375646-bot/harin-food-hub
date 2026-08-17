import handler from '../../../../../lib/shipping-reference/route-handler.js';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function POST(request){return handler.handleHoliday(request);}
