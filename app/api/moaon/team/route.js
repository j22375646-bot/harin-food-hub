import team from '../../../../lib/team/request.js';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const handle=team.createHandler();
export const GET=handle;
export const POST=handle;
