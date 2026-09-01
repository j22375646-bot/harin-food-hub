'use strict';

async function mapLimit(items,limit,work){
  const values=Array.from(items||[]);
  if(typeof work!=='function')throw new TypeError('work must be a function');
  if(!values.length)return [];
  const concurrency=Math.max(1,Math.min(values.length,Math.floor(Number(limit)||1)));
  const results=new Array(values.length);
  let cursor=0;
  async function run(){
    while(cursor<values.length){
      const index=cursor;
      cursor += 1;
      results[index]=await work(values[index],index);
    }
  }
  await Promise.all(Array.from({length:concurrency},()=>run()));
  return results;
}

module.exports={mapLimit};
