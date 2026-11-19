(function(root){
 'use strict';
 function similar(a,b){
  if(!a||!b||Math.abs(a.ratio/b.ratio-1)>.015||a.pixels.length!==b.pixels.length||!a.pixels.length)return false;
  const mean=values=>values.reduce((n,v)=>n+v,0)/values.length;
  const am=mean(a.pixels),bm=mean(b.pixels);
  let error=0,contrast=0,peak=0;
  for(let i=0;i<a.pixels.length;i++){const difference=Math.abs(a.pixels[i]-b.pixels[i]);error+=difference;peak=Math.max(peak,difference);contrast+=Math.abs(a.pixels[i]-am)+Math.abs(b.pixels[i]-bm);}
  error/=a.pixels.length;contrast/=2*a.pixels.length;
  // Keep this conservative: flat or merely similar receipt layouts are not enough.
  return contrast>=.5&&peak<=12&&error<=2&&error/contrast<=.06;
 }
 async function fingerprint(source){
  const img=new Image();img.src=source;await img.decode();
  const canvas=document.createElement('canvas');canvas.width=96;canvas.height=96;
  const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.fillStyle='white';ctx.fillRect(0,0,96,96);ctx.drawImage(img,0,0,96,96);
  const data=ctx.getImageData(0,0,96,96).data,pixels=[];
  for(let i=0;i<data.length;i+=4)pixels.push(Math.round(.299*data[i]+.587*data[i+1]+.114*data[i+2]));
  return {ratio:img.naturalWidth/img.naturalHeight,pixels};
 }
 const cache=new WeakMap();
 async function fileHash(file){
  if(typeof file?.arrayBuffer!=='function'||!root.crypto?.subtle)return '';
  const digest=await root.crypto.subtle.digest('SHA-256',await file.arrayBuffer());
  return Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('');
 }
 async function find(image,items,{sourceHash=''}={}){
  const photos=items.filter(item=>item.kind!=='mileage'&&item.image);
  const exact=photos.find(item=>item.image===image||sourceHash&&item.sourceHash===sourceHash);if(exact)return exact;
  if(!photos.length)return null;
  let incoming;try{incoming=await fingerprint(image);}catch{return null;}
  for(const item of photos){
   let stored=cache.get(item);
   if(!stored||stored.image!==item.image){stored={image:item.image,value:fingerprint(item.image).catch(()=>null)};cache.set(item,stored);}
   if(similar(incoming,await stored.value))return item;
  }
  return null;
 }
 async function scan(items){const seen=[],pairs=[];for(const item of items){if(item.kind==='mileage'||!item.image)continue;const first=await find(item.image,seen,{sourceHash:item.sourceHash});if(first)pairs.push({first,second:item});seen.push(item);}return pairs;}
 const api={similar,find,fileHash,scan};root.ReceiptDuplicates=api;if(typeof module!=='undefined')module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
