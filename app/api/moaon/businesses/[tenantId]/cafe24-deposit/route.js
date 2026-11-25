import runtimeModule from '../../../../../../lib/tenancy/workspace-cafe24-deposit.js';

export const runtime='nodejs';
export const maxDuration=45;
const composition=runtimeModule.createWorkspaceCafe24Deposit();
export async function GET(request){return composition.handle(request);}
export async function POST(request){return composition.handle(request);}
