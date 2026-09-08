import businessListRuntime from '../../../../lib/tenancy/business-list-runtime.js';

export const runtime = 'nodejs';
const runtimeComposition = businessListRuntime.createBusinessListRuntime();
export async function GET(request) {
  return runtimeComposition.handle(request);
}
