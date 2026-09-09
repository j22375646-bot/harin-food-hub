import credentialSaveRuntime from '../../../../lib/tenancy/credential-save-runtime.js';

export const runtime = 'nodejs';
const composition = credentialSaveRuntime.createCredentialSaveRuntime();
export async function POST(request) {
  return composition.handle(request);
}
