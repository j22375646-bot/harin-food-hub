'use strict';

const API='https://api.github.com';
function headers(config){return {Accept:'application/vnd.github+json',Authorization:`Bearer ${config.token}`,'X-GitHub-Api-Version':'2026-03-10','User-Agent':'harin-food-hub'};}
async function readJson(path,config,fetchImpl){
  const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),10000);
  try{
    const response=await fetchImpl(`${API}${path}`,{headers:headers(config),signal:controller.signal,cache:'no-store'});const payload=await response.json().catch(()=>({}));
    if(!response.ok){const error=new Error(payload.message||`GitHub 응답 오류 (${response.status})`);error.code='GITHUB_RELEASE_READ_FAILED';error.status=response.status;throw error;}return payload;
  }finally{clearTimeout(timeout);}
}
async function probe({config,fetchImpl=fetch}={}){
  const base=`/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}`;
  const [repository,tags,releases]=await Promise.all([readJson(base,config,fetchImpl),readJson(`${base}/tags?per_page=20`,config,fetchImpl),readJson(`${base}/releases?per_page=20`,config,fetchImpl)]);
  const latestTag=Array.isArray(tags)?tags[0]:null,latestRelease=Array.isArray(releases)?releases[0]:null;
  return {status:'SUCCESS',sourceTimestamp:latestRelease?.published_at||repository.pushed_at||new Date().toISOString(),metricSummary:{repository:`${config.owner}/${config.repo}`,private:Boolean(repository.private),default_branch:repository.default_branch||null,tag_count:Array.isArray(tags)?tags.length:0,latest_tag:latestTag?.name||null,latest_tag_sha:latestTag?.commit?.sha||null,release_count:Array.isArray(releases)?releases.length:0,latest_release_tag:latestRelease?.tag_name||null,latest_release_name:latestRelease?.name||null,latest_release_published_at:latestRelease?.published_at||null,has_release_record:Boolean(latestRelease)}};
}
module.exports={probe,readJson,headers};
