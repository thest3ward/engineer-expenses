(function(root){
 'use strict';
 const xml=s=>String(s).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
 const serial=text=>(Date.parse(text+(text.length===10?'T00:00:00Z':text.length===16?':00Z':'Z'))-Date.UTC(1899,11,30))/86400000;
 function cell(sheet,address,value,{cache=false}={}){
  const regex=new RegExp(`<x:c\\b[^>]*\\br="${address}"[^>]*?(?:\\/>|>[\\s\\S]*?<\\/x:c>)`);
  if(!regex.test(sheet))throw Error('The Excel template is missing cell '+address+'.');
  return sheet.replace(regex,original=>{const style=original.match(/\bs="(\d+)"/)?.[1]||'1';if(cache){const formula=original.match(/<x:f\b[^>]*>[\s\S]*?<\/x:f>/)?.[0];if(!formula)throw Error('The template formula is missing in '+address+'.');return `<x:c r="${address}" s="${style}">${formula}<x:v>${value}</x:v></x:c>`;}if(typeof value==='number')return `<x:c r="${address}" s="${style}"><x:v>${value}</x:v></x:c>`;return `<x:c r="${address}" s="${style}" t="inlineStr"><x:is><x:t xml:space="preserve">${xml(value)}</x:t></x:is></x:c>`;});
 }
 async function bytes(state,month,template){
  const T=root.TimeCore,r=T.report(state,month);if(!r.ready)throw Error('Enter your name, finish running work and check every recorded day first.');if(r.rows.length>2000)throw Error('This month exceeds the Excel limit of 2,000 daily work periods.');
  if(!template){const response=await fetch('time-template.xlsx');if(!response.ok)throw Error('The Excel template could not load. Check your connection and try again.');template=await response.arrayBuffer();}
  const zip=await root.JSZip.loadAsync(template),label=new Intl.DateTimeFormat('en-GB',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(month+'-01T12:00Z'));
  let summary=await zip.file('xl/worksheets/sheet1.xml').async('string'),periods=await zip.file('xl/worksheets/sheet2.xml').async('string');
  for(const [key,value] of [['B3',state.engineer],['E3',label]]){summary=cell(summary,key,value);periods=cell(periods,key,value);}
  r.days.forEach((d,i)=>{const row=i+7;const values={A:serial(d.date),B:new Intl.DateTimeFormat('en-GB',{weekday:'long',timeZone:'UTC'}).format(new Date(d.date+'T12:00Z')),E:d.onCall?'Yes':'',F:d.bankHoliday?'Yes':'',G:d.night?'Yes':'',H:d.entries.length?(d.reviewed?'Yes':'No'):''};for(const [col,value] of Object.entries(values))summary=cell(summary,col+row,value);summary=cell(summary,'C'+row,d.entries.length,{cache:true});summary=cell(summary,'D'+row,d.hours,{cache:true});});
  summary=cell(summary,'C39',r.rows.length,{cache:true});summary=cell(summary,'D39',r.hours,{cache:true});
  r.rows.forEach((e,i)=>{const row=i+7;for(const [col,value] of Object.entries({A:serial(e.date),B:serial(T.stamp(e.start,true)),C:serial(T.stamp(e.end,true)),D:e.kind==='callout'?'Call-out':'Work',E:e.hours,F:e.note||''}))periods=cell(periods,col+row,value);});
  // The public template contains no engineer data. Remove unused styled detail rows from each download.
  periods=periods.replace(/<x:row\b[^>]*\br="(\d+)"[^>]*>[\s\S]*?<\/x:row>/g,(row,n)=>+n>6+r.rows.length?'':row);
  zip.file('xl/worksheets/sheet1.xml',summary);zip.file('xl/worksheets/sheet2.xml',periods);
  let workbook=await zip.file('xl/workbook.xml').async('string');workbook=workbook.replace('</x:workbook>','<x:calcPr calcMode="auto" fullCalcOnLoad="1" forceFullCalc="1"/></x:workbook>');zip.file('xl/workbook.xml',workbook);
  return zip.generateAsync({type:'uint8array',compression:'DEFLATE'});
 }
 async function create(state,month){const data=await bytes(state,month);return new File([data],`Timesheet-${state.engineer.replace(/[^a-zA-Z0-9 -]/g,'').trim()||'Engineer'}-${month}.xlsx`,{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});}
 root.TimeExcel={bytes,create};if(typeof module!=='undefined')module.exports=root.TimeExcel;
})(typeof globalThis!=='undefined'?globalThis:this);
