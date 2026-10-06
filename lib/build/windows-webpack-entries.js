'use strict';
// Next 16.3 prefixes path.relative with './'. Across Windows drives that
// produces './C:/...' instead of an absolute entry. Keep all other requests.
function normalizeImport(value) {
 if(typeof value==='string')return /^\.\/[A-Za-z]:[\\/]/.test(value)?value.slice(2):value;
 if(Array.isArray(value))return value.map(normalizeImport);
 return value;
}
function normalizeWindowsWebpackEntries(entries) {
 if(typeof entries==='string'||Array.isArray(entries))return normalizeImport(entries);
 if(!entries||typeof entries!=='object')return entries;
 return Object.fromEntries(Object.entries(entries).map(([name,value])=>[name,
  value&&typeof value==='object'&&!Array.isArray(value)&&Object.hasOwn(value,'import')
   ? {...value,import:normalizeImport(value.import)}:normalizeImport(value)]));
}
module.exports={normalizeWindowsWebpackEntries};
