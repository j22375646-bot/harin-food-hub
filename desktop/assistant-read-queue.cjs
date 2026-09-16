'use strict';
// Serialize read requests around the transport's single permit. Never retry writes.
const reads=new Set(['READ','BOT_LIST','AUTO_READ','ACT_READ','ADS_READ','MENU_READ','LEARN_READ','CASE_READ']);
function createReadQueue(run,generation){
 let tail=Promise.resolve(),pending=0;
 return input=>{
  const epoch=generation();
  if(pending>=16)return Promise.resolve({ok:false,code:'ASSISTANT_RATE_LIMITED'});
  const invoke=()=>epoch===generation()?run(input):{ok:false,code:'ASSISTANT_AUTH_REQUIRED'};
  const job=reads.has(input?.action)?tail.then(invoke,invoke):Promise.resolve().then(invoke);
  pending++;tail=Promise.allSettled([tail,job]);
  return job.finally(()=>pending--);
 };
}
module.exports={createReadQueue};
