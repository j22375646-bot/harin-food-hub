import businessListRequest from '../../../../lib/tenancy/business-list-request.js';

export const runtime = 'nodejs';
// Intentionally fail closed until the verified identity and restricted control
// database adapters are composed. Do not substitute the legacy global owner.
const handle = businessListRequest.createBusinessListRequest();
export async function GET(request) {
  return handle(request);
}
