'use strict';
function summarize(samples){
 if(!samples.length||samples.some(n=>!Number.isFinite(n)||n<0))throw TypeError('Complete nonnegative timings required');
 const sorted=[...samples].sort((a,b)=>a-b),n=sorted.length;
 return {count:n,min:sorted[0],median:n%2?sorted[(n-1)/2]:(sorted[n/2-1]+sorted[n/2])/2,p95:sorted[Math.ceil(n*.95)-1],max:sorted[n-1]};
}
function splitTiming({shellReadyMs,probeStartMs,probeEndMs}){
 if(![shellReadyMs,probeStartMs,probeEndMs].every(Number.isFinite)||shellReadyMs<0||probeStartMs<shellReadyMs||probeEndMs<probeStartMs)throw TypeError('Monotonic timing required');
 return {shellReadyMs,probeMs:probeEndMs-probeStartMs};
}
module.exports={summarize,splitTiming};
