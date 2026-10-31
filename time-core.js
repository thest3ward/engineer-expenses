(function(root){
 'use strict';
 const zone='Europe/London', minute=60000;
 const fmt=new Intl.DateTimeFormat('en-GB',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
 function stamp(ms,seconds=false){const p=Object.fromEntries(fmt.formatToParts(new Date(ms)).map(p=>[p.type,p.value]));return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}${seconds?':'+p.second:''}`;}
 function date(ms){return stamp(ms).slice(0,10);}
 function wall(text){
  if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(text))throw Error('Enter both a date and a time.');
  const base=Date.parse(text+(text.length===16?':00Z':'Z')), candidates=[base,base-3600000].filter(ms=>Number.isFinite(ms)&&stamp(ms,text.length===19)===text);
  if(candidates.length!==1)throw Error(candidates.length?'This UK time occurs twice when clocks change. Choose a time outside the repeated hour.':'This UK date or time does not exist. Check the clocks-change hour.');
  return candidates[0];
 }
 function addDate(text,days){const d=new Date(text+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10);}
 function monthDates(month){if(!/^\d{4}-\d{2}$/.test(month)||+month.slice(5)<1||+month.slice(5)>12)throw Error('Choose a valid month.');const result=[];for(let day=month+'-01';day.startsWith(month);day=addDate(day,1))result.push(day);return result;}
 function segments(entry,month,now=Date.now()){
  const end=entry.end??now,out=[];let start=entry.start;
  while(start<end){const day=date(start),midnight=wall(addDate(day,1)+'T00:00'),finish=Math.min(end,midnight);if(!month||day.startsWith(month))out.push({...entry,date:day,start,end:finish,reviewed:!!entry.reviewedDays?.includes(day),open:entry.end===null,hours:(finish-start)/3600000});start=finish;}
  return out;
 }
 function validate(entry,entries){
  if(!Number.isFinite(entry.start)||!Number.isFinite(entry.end)||entry.end<=entry.start)throw Error('Finish must be after start.');
  if(entry.end-entry.start>7*86400000)throw Error('That entry is longer than a week. Check its dates.');
  if(!['work','callout'].includes(entry.kind))throw Error('Choose Work or Call-out.');
  if(entries.some(e=>e.id!==entry.id&&entry.start<(e.end??Infinity)&&entry.end>e.start))throw Error('This overlaps another work period. Check the times.');
 }
 function report(state,month,now=Date.now()){
  const rows=state.entries.flatMap(e=>segments(e,month,now)).sort((a,b)=>a.start-b.start);
  const days=monthDates(month).map(date=>{const entries=rows.filter(e=>e.date===date),flags=state.days[date]||{};return {date,entries,hours:entries.reduce((s,e)=>s+e.hours,0),...flags,reviewed:entries.length>0&&entries.every(e=>e.reviewed&&!e.open)};});
  const running=state.entries.some(e=>e.end===null&&e.start<wall(addDate(monthDates(month).at(-1),1)+'T00:00')&&now>=wall(month+'-01T00:00'));
  return {rows,days,hours:rows.reduce((s,e)=>s+e.hours,0),running,ready:!!state.engineer.trim()&&rows.length>0&&!running&&rows.every(e=>e.reviewed&&!e.open)};
 }
 function duration(hours){const mins=Math.round(hours*60);return `${Math.floor(mins/60)}h ${String(mins%60).padStart(2,'0')}m`;}
 const api={zone,minute,stamp,date,wall,addDate,monthDates,segments,validate,report,duration};root.TimeCore=api;if(typeof module!=='undefined')module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
