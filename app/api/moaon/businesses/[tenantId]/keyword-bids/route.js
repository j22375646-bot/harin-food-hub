import runtimeModule from '../../../../../../lib/tenancy/business-list-runtime.js';
import identity from '../../../../../../lib/tenancy/dashboard-identity.js';
import finance from '../../../../../../lib/tenancy/workspace-finance-runtime.js';
import bids from '../../../../../../lib/tenancy/keyword-bids-request.js';
import operations from '../../../../../../lib/dashboard/keyword-bids.js';
import database from '../../../../../../lib/cafe24/supabase.js';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const composition=runtimeModule.createBusinessListRuntime({guardRequest:bids.guardKeywordBids,createService:({database:control,identityDb,authAdmin})=>bids.createKeywordBidsRequest({resolveContext:finance.createFinanceContextResolver({database:control,verifySession:identity.createDashboardIdentityVerifier({db:identityDb,authAdmin,timeoutMs:10000})}),operate:operations.createKeywordBidOperations({db:database.getSupabase()})})});
export async function POST(request){return composition.handle(request);}
