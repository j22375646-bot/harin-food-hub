'use strict';

const NAVER='NAVER';
const ALLOWED_DAYS=new Set([1,3,7]);
const text=value=>String(value??'').trim();
const finite=value=>{
  if(value===null||value===undefined||value==='')return null;
  const parsed=Number(value);
  return Number.isFinite(parsed)?parsed:null;
};
const latest=values=>values.length?values.at(-1):null;

function buildBidKeywordTrendRequest({open=false,platform=NAVER,keywordId=''}={}){
  const id=text(keywordId);
  if(open!==true||text(platform).toUpperCase()!==NAVER||!id)return null;
  return `/api/naver/bid-performance-analysis?keywordId=${encodeURIComponent(id)}`;
}

function buildBidKeywordTrendView({analysis={},days=7}={}){
  const platform=text(analysis?.scope?.platform).toUpperCase();
  const range=ALLOWED_DAYS.has(Number(days))?Number(days):7;
  if(platform!==NAVER){
    return {platform:platform||null,status:'PLATFORM_MISMATCH',days:range,daily:[],summary:{average_rank:null,latest_rank:null,rank_improvement:null,latest_bid:null,bid_change:null,target_rank:null,hit_rate_percent:null,hit_days:null,ranked_days:0,competition:null}};
  }
  const daily=(Array.isArray(analysis?.daily)?analysis.daily:[]).slice(-range).map(item=>({
    date:text(item?.date)||null,
    average_rank:finite(item?.average_rank),
    bid:finite(item?.bid)
  }));
  const ranks=daily.map(item=>item.average_rank).filter(value=>value!==null&&value>0);
  const bids=daily.map(item=>item.bid).filter(value=>value!==null&&value>0);
  const latestRank=latest(ranks),latestBid=latest(bids);
  const rankImprovement=ranks.length>1?ranks[0]-latestRank:null;
  const bidChange=new Set(bids).size>1?latestBid-bids[0]:null;
  const averageRank=finite(analysis?.windows?.[String(range)]?.average_rank);
  const rankWindow=analysis?.rank?.windows?.[String(range)]||{};
  const hasRank=ranks.length>0||averageRank!==null,hasBid=bids.length>0;
  return {
    platform:NAVER,status:hasRank&&hasBid?'READY':hasRank||hasBid?'PARTIAL':'NO_DATA',days:range,daily,
    summary:{
      average_rank:averageRank,
      latest_rank:latestRank,
      rank_improvement:rankImprovement,
      latest_bid:latestBid,
      bid_change:bidChange,
      target_rank:finite(analysis?.rank?.target),
      hit_rate_percent:finite(rankWindow?.percent),
      hit_days:finite(rankWindow?.hit_days),
      ranked_days:finite(rankWindow?.ranked_days)??0,
      competition:rankWindow?.competition||null
    }
  };
}

module.exports={ALLOWED_DAYS,buildBidKeywordTrendRequest,buildBidKeywordTrendView};
