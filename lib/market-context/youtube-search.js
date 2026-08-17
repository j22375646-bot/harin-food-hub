'use strict';

const utils=require('../public-evidence/candidate-utils.js');
const PROVIDER='YOUTUBE_SEARCH';
function requestUrl({apiKey},query){const url=new URL('https://www.googleapis.com/youtube/v3/search');url.searchParams.set('key',apiKey);url.searchParams.set('part','snippet');url.searchParams.set('type','video');url.searchParams.set('q',query);url.searchParams.set('regionCode','KR');url.searchParams.set('relevanceLanguage','ko');url.searchParams.set('safeSearch','strict');url.searchParams.set('maxResults','8');return url.toString();}
function normalizeItem(item,now){
  const videoId=utils.cleanText(item?.id?.videoId,40),snippet=item?.snippet||{},title=utils.cleanText(snippet.title,180),description=utils.cleanText(snippet.description,500),channel=utils.cleanText(snippet.channelTitle,120),publishedAt=utils.cleanText(snippet.publishedAt,40),sourceUrl=`https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
  const candidate={provider:PROVIDER,evidence_kind:'PUBLIC_VIDEO_CONTEXT',title,summary:[channel&&`채널 ${channel}`,publishedAt&&`게시 ${new Date(publishedAt).toLocaleDateString('ko-KR')}`,description].filter(Boolean).join(' · '),source_url:sourceUrl,source_name:'YouTube Data API',source_date:utils.dateValue(publishedAt),image_url:utils.safeUrl(snippet?.thumbnails?.medium?.url||snippet?.thumbnails?.default?.url),external_id:videoId,fetched_at:new Date(now).toISOString(),metadata:{video_id:videoId,channel_title:channel,published_at:publishedAt}};
  candidate.external_key=utils.externalKey(candidate.provider,candidate.external_id,candidate.source_url);return candidate;
}
async function probe({config,query,fetchImpl=fetch,now=new Date()}){
  const response=await fetchImpl(requestUrl(config,query),{headers:{accept:'application/json'},cache:'no-store'});
  if(!response.ok){const payload=await response.json().catch(()=>({})),reason=utils.cleanText(payload?.error?.errors?.[0]?.reason,80);const error=new Error(utils.cleanText(payload?.error?.message,220)||`YouTube 응답 ${response.status}`);error.code=reason==='quotaExceeded'?'QUOTA_EXCEEDED':'YOUTUBE_HTTP_ERROR';throw error;}
  const payload=await response.json(),items=(Array.isArray(payload?.items)?payload.items:[]).filter(item=>item?.id?.videoId).slice(0,8);
  return {provider:PROVIDER,status:items.length?'READY':'NO_DATA',totalCount:items.length,reason:items.length?null:'NO_VIDEO_DATA',quotaCost:1,candidates:items.map(item=>normalizeItem(item,now))};
}
module.exports={PROVIDER,requestUrl,normalizeItem,probe};
