(function(root){
 'use strict';
 // Keep saving separate from the preview code. Never open a window here.
 function prepare(name,env=root){
  if(typeof env.showSaveFilePicker!=='function')return null;
  // Request the picker during the original tap, before PDF generation can consume activation.
  return env.showSaveFilePicker({suggestedName:name,types:[{description:'PDF document',accept:{'application/pdf':['.pdf']}}],excludeAcceptAllOption:true});
 }
 function shareable(file,env=root){try{return typeof env.navigator?.share==='function'&&!!env.navigator.canShare?.({files:[file]});}catch{return false;}}
 async function save(file,{picker=null,env=root,download}={}){
  if(picker){const handle=await picker;const writable=await handle.createWritable();try{await writable.write(file);await writable.close();}catch(error){try{await writable.abort();}catch{}throw error;}return 'saved';}
  if(shareable(file,env)){await env.navigator.share({files:[file],title:file.name});return 'device';}
  if(typeof download==='function'){download(file,file.name);return 'download';}
  throw Error('This browser cannot save the PDF. Open the app in Safari or Chrome.');
 }
 const api={prepare,shareable,save};root.PdfSave=api;if(typeof module!=='undefined')module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
