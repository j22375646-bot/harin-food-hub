import workspace from '../../../../../../lib/tenancy/workspace-orders-runtime.js';
import { GET as readHarinOrders } from '../../../../orders/page/route.js';

export const runtime='nodejs';
const composition=workspace.createWorkspaceOrdersRuntime({readOrders:readHarinOrders});
export async function GET(request){
  return composition.handle(request);
}
