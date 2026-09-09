'use strict';
function rightDisplayBounds(displays,primary){
 const d=displays.filter(d=>d.id!==primary.id&&d.workArea.x>=primary.workArea.x+primary.workArea.width).sort((a,b)=>a.workArea.x-b.workArea.x)[0];
 if(!d||d.workArea.width<400||d.workArea.height<400)return null;
 return {x:d.workArea.x+10,y:d.workArea.y+30,width:Math.min(1440,d.workArea.width-20),height:Math.min(960,d.workArea.height-60)};
}
module.exports={rightDisplayBounds};
