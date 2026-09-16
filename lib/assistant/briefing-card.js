'use strict';
const fs=require('node:fs/promises'),path=require('node:path');
const {createElement:h}=require('react');
const names={WORK:'업무비서',SOLO:'개인비서',AD:'광고비서'};
const colors={WORK:'#6A52BC',SOLO:'#386E82',AD:'#3F6A54'};
function koreanTime(line){
 const value=line.replace(/^(조회:|API 조회:)\s*/,'');
 if(!/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value)||!Number.isFinite(Date.parse(value)))return value;
 const p=Object.fromEntries(new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',month:'numeric',day:'numeric',weekday:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(value)).map(x=>[x.type,x.value]));
 return `${p.month}월 ${p.day}일 (${p.weekday}) ${p.hour}:${p.minute} · 한국 시간`;
}
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
 let clipped=rows.length>14||rows.some(x=>x.length>120);
 if(clipped)foot.push('긴 내용은 모아온에서 전체 확인해 주세요.');
 const channels=new Map(),columns=new Set(),extra=[],metrics=[];let tasks=null;
 for(const line of visible){
  let match=line.match(/^(네이버|카페24|쿠팡) · 발급 전 (\d+건|확인 필요) \/ 배송대기 (\d+건|확인 필요)$/);
  if(match){channels.set(match[1],{...channels.get(match[1]),name:match[1],orders:match[2],shipping:match[3]});columns.add('orders');columns.add('shipping');continue;}
  match=line.match(/^(네이버|카페24|쿠팡) · 미답변 (\d+건|확인 필요)$/);
  if(match){channels.set(match[1],{...channels.get(match[1]),name:match[1],cs:match[2]});columns.add('cs');continue;}
  match=line.match(/^키 발급자 업무 · 오늘 마감 (\d+건|확인 필요) \/ 기한 초과 (\d+건|확인 필요)$/);
  if(match){tasks={today:match[1],overdue:match[2]};continue;}
  if(slot==='AD'){
   match=line.match(/^광고비 (\d+(?:\.\d+)?|확인 필요)원 · 클릭 (\d+(?:\.\d+)?|확인 필요)$/);
   if(match){metrics.push({label:'광고비',value:match[1]==='확인 필요'?match[1]:match[1]+'원'},{label:'클릭',value:match[2]});continue;}
   match=line.match(/^전환 (\d+(?:\.\d+)?|확인 필요) · ROAS (\d+(?:\.\d+)?|확인 필요)%$/);
   if(match){metrics.push({label:'전환',value:match[1]},{label:'ROAS',value:match[2]==='확인 필요'?match[2]:match[2]+'%'});continue;}
  }
  if(/^모아온 (업무비서|개인비서) 브리핑$/.test(line))continue;
  extra.push(line);
 }
 const time=foot.find(x=>/^(조회:|API 조회:)/.test(x));
 if(extra.length>8||extra.some(x=>x.length>90))clipped=true;
 extra.splice(8);for(let i=0;i<extra.length;i++)if(extra[i].length>90)extra[i]=extra[i].slice(0,87)+'…';
 const noteLines=foot.filter(x=>! /^(조회:|API 조회:)/.test(x));if(noteLines.length>4||noteLines.some(x=>x.length>120))clipped=true;
 const notes=noteLines.slice(0,4).map(x=>x.startsWith('모아온 저장 자료')?'모아온 저장 자료 기준\n원본 수집 시각은 확인이 필요해요.':x==='자료 상태: PARTIAL'?'일부 일자·지표는 확인이 필요해요.':x==='자료 상태: OBSERVED'?'조회 범위의 지표 집계 완료':x.length>120?x.slice(0,117)+'…':x);
 if(clipped&&!notes.some(x=>x.includes('전체 확인')))notes.push('긴 내용은 모아온에서 전체 확인해 주세요.');
 const height=340+(tasks?314:0)+(metrics.length?120:0)+Math.ceil(metrics.length/2)*246+(channels.size?166+channels.size*124:0)+extra.reduce((n,x)=>n+54+Math.ceil(x.length/23)*60,0)+notes.reduce((n,x)=>n+Math.ceil(x.length/27)*48,0)+100;
 return {slot,title,rows:visible,foot,height:Math.max(720,Math.min(5000,height)),clipped,channels:[...channels.values()],columns:['orders','shipping','cs'].filter(x=>columns.has(x)),tasks,metrics,extra,time:time?koreanTime(time):'조회 시각 확인 필요',notes,badge:/시험/.test(title)?'시험 발송':/예시/.test(title)?'예시 자료':''};
}
const box=(style,...children)=>h('div',{style:{display:'flex',flexShrink:0,...style}},...children);
function element(m){
 const accent=colors[m.slot],ink='#242439',muted='#64657C',pale=m.slot==='AD'?'#EAF4EE':m.slot==='SOLO'?'#EAF3F7':'#F0ECFC';
 const value=(v,size=64,unit=true)=>{const match=v?.match(/^(\d+(?:\.\d+)?)(건|원|%)?$/),num=match?Number(match[1]).toLocaleString('ko-KR',{maximumFractionDigits:2}):null;return box({fontSize:num?Math.min(size,num.length>8?46:size):36,color:!num?'#996126':Number(match[1])===0?'#797A90':ink,alignItems:'baseline',gap:7},num||v||'확인 필요',...(unit&&match?.[2]?[h('span',{style:{fontSize:36,color:muted}},match[2])]:[]));};
 const tile=(label,v,warn)=>box({width:468,height:222,borderRadius:26,padding:30,flexDirection:'column',justifyContent:'space-between',background:warn&&v!=='0건'&&v!=='확인 필요'?'#FFF1E8':pale},box({fontSize:38,color:muted},label),value(v,84));
 const cells=(c,header=false)=>box({height:header?80:124,alignItems:'center',background:header?pale:'#FFFFFF',borderBottom:header?'none':'1px solid #ECEBF3',padding:'0 24px'},box({width:216,fontSize:header?36:44,color:header?muted:ink},header?'채널':c.name),...m.columns.map(key=>box({width:(924-216)/m.columns.length,justifyContent:'center',alignItems:'center',fontSize:38,color:muted},header?({orders:'발급 전',shipping:'배송대기',cs:'미답변'})[key]:value(c[key],64,false))));
 return box({width:'100%',height:'100%',background:'#FCFBFF',fontFamily:'Moaon',color:ink,padding:54,flexDirection:'column'},
  box({justifyContent:'space-between',alignItems:'center'},box({fontSize:36,color:accent,gap:14,alignItems:'center'},box({width:12,height:36,borderRadius:6,background:accent}),'모아온 '+names[m.slot]),m.badge?box({fontSize:32,color:accent,background:pale,borderRadius:30,padding:'10px 22px'},m.badge):null),
  box({fontSize:64,marginTop:32,lineHeight:1.2},m.slot==='AD'?'네이버 광고 리포트':'오늘의 업무 브리핑'),
  box({fontSize:36,color:muted,marginTop:18,marginBottom:40},m.time),
  ...(m.tasks?[box({gap:24},tile('오늘 마감',m.tasks.today,false),tile('기한 초과',m.tasks.overdue,true)),box({fontSize:36,color:muted,marginTop:16,marginBottom:34},'업무 범위 · 조회 키 발급자에게 배정된 업무')]:[]),
  ...m.metrics.flatMap((metric,i)=>i%2?[]:[box({gap:24,marginBottom:24},tile(metric.label,metric.value,false),...(m.metrics[i+1]?[tile(m.metrics[i+1].label,m.metrics[i+1].value,false)]:[]))]),
  ...(m.channels.length?[box({justifyContent:'space-between',alignItems:'center',marginBottom:20,fontSize:42},m.columns.length===1?'채널별 문의':m.columns.includes('cs')?'채널별 주문·문의':'채널별 주문',h('span',{style:{fontSize:36,color:muted}},'단위: 건')),box({flexDirection:'column',borderRadius:26,overflow:'hidden',border:'1px solid #E2DEED'},cells({},true),...m.channels.map(c=>cells(c)))]:[]),
  ...m.extra.map(line=>box({fontSize:44,lineHeight:1.35,marginTop:24,padding:26,borderRadius:20,background:pale},line)),
  box({flexDirection:'column',marginTop:30,fontSize:36,lineHeight:1.35,color:muted},...m.notes.flatMap(x=>x.split('\n').map(line=>box({marginBottom:8},line)))),
  box({marginTop:'auto',paddingTop:28,fontSize:36,color:accent},'다음 행동은 이미지 아래 버튼에서')
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
