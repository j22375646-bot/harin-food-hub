'use strict';
module.exports=async function timed(stage,work){const start=Date.now();try{return await work();}finally{console.info('AI_STAGE',stage,Date.now()-start);}};
