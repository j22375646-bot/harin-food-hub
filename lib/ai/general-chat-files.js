'use strict';
function validFiles(files){return Array.isArray(files)&&files.length<=3&&files.every(f=>f&&Object.keys(f).length===3&&typeof f.name==='string'&&f.name.length>0&&f.name.length<=160&&['image/png','image/jpeg','application/pdf','text/plain'].includes(f.mimeType)&&typeof f.data==='string'&&f.data.length>0&&f.data.length<=2796204&&f.data.length%4===0&&/^[A-Za-z0-9+/]*={0,2}$/.test(f.data))&&files.reduce((n,f)=>n+f.data.length,0)<=2796204;}
module.exports={validFiles};
