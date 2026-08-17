'use strict';

function decode(value){
  return String(value||'').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gu,'$1').replace(/&lt;/giu,'<').replace(/&gt;/giu,'>').replace(/&quot;/giu,'"').replace(/&#39;|&apos;/giu,"'").replace(/&amp;/giu,'&').trim();
}

function tag(xml,name){
  return decode(String(xml||'').match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`,'i'))?.[1]||'');
}

function items(xml){
  return [...String(xml||'').matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/giu)].map(match=>match[1]);
}

module.exports={decode,tag,items};
