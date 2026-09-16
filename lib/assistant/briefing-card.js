'use strict';
const fs=require('node:fs/promises'),path=require('node:path');
const {createElement:h}=require('react');
const names={WORK:'업무비서',SOLO:'개인비서',AD:'광고비서'};
const colors={WORK:'#6A52BC',SOLO:'#386E82',AD:'#3F6A54'};
// Render known briefing text, never model-generated numbers or external image URLs.
function model(text,slot){
 if(!names[slot]||typeof text!=='string'||!text.trim()||text.length>3900)throw Error('CARD_INVALID');
 const lines=text.split('\n').map(x=>x.trim()).filter(Boolean);
 const title=lines.shift(),foot=[],rows=[];
 for(const line of lines){
  if(/^(조회:|모아온 저장 자료|광고 전환매출은|자료 상태:|API 조회:)/.test(line))foot.push(line);
  else rows.push(line);
 }
 // Keep cards readable. Full text remains in the stored briefing / report.
 const visible=rows.slice(0,14).map(x=>x.length>120?x.slice(0,117)+'…':x);
 const clipped=rows.length>14||rows.some(x=>x.length>120);
 if(clipped)foot.push('긴 내용은 모아온에서 전체 확인해 주세요.');
 const height=400+visible.reduce((n,x)=>n+84+Math.max(0,Math.ceil(x.length/30)-1)*48,0)+foot.reduce((n,x)=>n+Math.ceil(x.length/40)*38,0);
 return {slot,title,rows:visible,foot,height:Math.max(640,Math.min(4200,height)),clipped};
}
const box=(style,...children)=>h('div',{style:{display:'flex',flexShrink:0,...style}},...children);
function element(m){
 const accent=colors[m.slot];
 return box({width:'100%',height:'100%',background:'#F4F3F9',fontFamily:'Moaon',color:'#253047',padding:44,flexDirection:'column'},
  box({justifyContent:'space-between',alignItems:'center',fontSize:27,color:accent},h('span',null,'모아온'),h('span',null,names[m.slot]+' 브리핑')),
  box({fontSize:46,marginTop:28,marginBottom:32,lineHeight:1.3},m.title.replace(/^모아온 (업무비서|개인비서) 브리핑$/,'오늘의 업무, 한눈에')),
  box({flexDirection:'column',background:'#FFFFFF',borderRadius:24,padding:'18px 30px',border:'1px solid #E3E0EE'},
   ...m.rows.map((line,i)=>{
    const sep=line.indexOf(' · '),channel=/^(네이버|카페24|쿠팡) · /.test(line);
    return box({padding:'18px 0',borderTop:i?'1px solid #ECEAF2':'none',fontSize:32,lineHeight:1.35,alignItems:'flex-start'},
     ...(channel?[box({width:140,flexShrink:0,color:accent},line.slice(0,sep)),box({flex:1},line.slice(sep+3))]:[box({flex:1,color:line.includes('확인 필요')?'#8B591F':'#253047'},line)]));
   })),
  box({flexDirection:'column',marginTop:26,fontSize:24,lineHeight:1.35,color:'#627087'},...m.foot.map(x=>box({marginBottom:6},x))),
  box({marginTop:'auto',paddingTop:18,fontSize:24,color:accent},'아래 버튼으로 이어서 확인하세요')
 );
}
let font;
async function render(text,slot){
 const {ImageResponse}=require('next/og');
 font ||= fs.readFile(path.join(process.cwd(),'lib/assistant/assets/MoaonBriefing-Medium.ttf')).catch(e=>{font=null;throw e;});
 const m=model(text,slot),response=new ImageResponse(element(m),{width:1080,height:m.height,fonts:[{name:'Moaon',data:await font,weight:400,style:'normal'}]});
 const image=Buffer.from(await response.arrayBuffer());
 if(image.length>2000000||image.length<8||image.subarray(0,8).toString('hex')!=='89504e470d0a1a0a')throw Error('CARD_RENDER_FAILED');
 return image;
}
async function send({token,chatId,text,markup,slot,telegram,renderer=render}){
 let image;try{image=await renderer(text,slot);}catch{/* Before any Telegram request: safe text fallback. */}
 if(!image)return telegram(token,'sendMessage',{chat_id:chatId,text:text.slice(0,3900),reply_markup:markup});
 // No retry or text fallback after sendPhoto: a timeout may already have delivered it.
 const lines=text.split('\n').filter(Boolean),meta=lines.filter(x=>/^(조회:|API 조회:|모아온 저장 자료|광고 전환매출은)/.test(x));
 return telegram(token,'sendPhoto',{chat_id:chatId,photo:image,caption:[lines[0],...meta,'자세한 내용은 카드와 아래 버튼에서 확인하세요.'].join('\n').slice(0,900),reply_markup:markup});
}
module.exports={model,element,render,send};
