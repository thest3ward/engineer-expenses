(function(root){
 'use strict';
 function pence(value){const s=String(value??'').trim();if(!/^\d{1,7}(?:\.\d{1,2})?$/.test(s))return null;const [whole,frac='']=s.split('.');const n=Number(whole)*100+Number(frac.padEnd(2,'0'));return n>0?n:null;}
 function validDate(s){if(!/^\d{4}-\d{2}-\d{2}$/.test(s))return false;const d=new Date(s+'T12:00:00Z');return !isNaN(d)&&d.toISOString().slice(0,10)===s&&Number(s.slice(0,4))>=2000&&Number(s.slice(0,4))<=2100;}
 const claimTypes=Object.freeze(['Food','Food - 12 hour shift','Food - staying away breakfast','Food - staying away lunch','Food - staying away dinner','Tools','Parking','Consumables','Other']);
 function mileagePence(miles,rate){
  if(!/^\d{1,7}(?:\.\d{1,2})?$/.test(String(miles))||Number(miles)<=0)return null;
  if(!/^\d{1,3}(?:\.\d{1,4})?$/.test(String(rate))||Number(rate)<=0)return null;
  const units=(value,places)=>{const [whole,part='']=String(value).split('.');return BigInt(whole)*10n**BigInt(places)+BigInt(part.padEnd(places,'0'));};
  return Number((units(miles,2)*units(rate,4)+5000n)/10000n);
 }
 function itemPence(r){return r.kind==='mileage'?mileagePence(r.miles,r.rate):pence(r.amount);}
 function validItem(r){
  if(!validDate(r.date)||!String(r.description||'').trim()||r.reading)return false;
  if(r.kind==='mileage')return r.category==='Mileage'&&r.personalVehicle===true&&/^\d{1,7}(?:\.\d{1,2})?$/.test(String(r.miles))&&Number(r.miles)>0&&(r.rate===''||mileagePence(r.miles,r.rate)!==null);
  return !!r.image&&claimTypes.includes(r.category)&&pence(r.amount)!==null;
 }
 function canCreate(s){return !!s.engineer.trim()&&validDate(s.claimDate)&&s.receipts.length>0&&s.receipts.every(r=>r.checked&&validItem(r)&&(s.paymentType!=='card'||r.kind!=='mileage'));}
 function totals(form){
  const receipts=form.receipts.filter(r=>r.kind!=='mileage').reduce((n,r)=>n+(pence(r.amount)||0),0);
  const mileage=form.receipts.filter(r=>r.kind==='mileage');
  const mileageAmount=mileage.reduce((n,r)=>n+(mileagePence(r.miles,r.rate)||0),0);
  const miles=mileage.reduce((n,r)=>n+(Number(r.miles)||0),0);
  const pending=mileage.some(r=>r.rate==='');
  const total=receipts+mileageAmount;
  return {receipts,mileageAmount,miles,pending,total,owed:form.paymentType==='card'?0:total};
 }
 function editItem(r,key,value){r[key]=value;r.checked=false;}
 function receiptTotal(lines){
  const net=/\b(?:sub[ -]*total|net|(?:ex(?:c|cl|clude|cluding)?|exclusive\s+of|before|without)\.?\s*(?:vat|tax)|(?:vat|tax)\s+excluded)\b/i;
  const inclusive=/\b(?:(?:inc(?:l|luding|lusive\s+of)?|with|after)\.?\s*(?:vat|tax)|(?:vat|tax)\s+incl(?:uded)?)\b/i;
  const total=/\b(?:total|amount|price|gross)\b/i;
  const paid=/\b(?:amount\s+paid|total\s+paid|payment\s+(?:amount|received)|(?:card|cash)\s+payment)\b/i;
  const due=/\b(?:balance\s+due|amount\s+(?:due|payable)|total\s+(?:due|payable)|to\s+pay)\b/i;
  function amounts(line){
   const pattern=/(?<![\d.,/\-])(?:\d{1,3}(?:,\d{3})+\.\d{2}|\d{1,7}[.,]\d{2})(?![\d.,/]|\s*%)/g;
   return [...line.matchAll(pattern)].filter(m=>!/-\s*[£]?\s*$/.test(line.slice(0,m.index))).map(m=>m[0].includes('.')?m[0].replace(/,/g,''):m[0].replace(',','.'));
  }
  const ranked=new Map();
  for(const [i,line] of lines.entries()){
   if(net.test(line)||/\b(?:change|cashback|tendered|saving|discount|refund|deposit)\b/i.test(line))continue;
   const gross=/\bgross\b/i.test(line)&&!/\bgross\s+(?:weight|margin)\b/i.test(line);
   const grossTotal=gross||(total.test(line)&&inclusive.test(line));
   if(!grossTotal&&/\b(?:vat|tax)\b/i.test(line))continue;
   const rank=grossTotal?5:/\b(?:grand\s+total|invoice\s+total|total\s+cost)\b/i.test(line)?4:paid.test(line)?1:due.test(line)?2:/\btotal\b/i.test(line)?3:0;
   if(!rank||/\b(?:total\s+(?:items|quantity|qty|savings|points)|items\s+total)\b/i.test(line))continue;
   let values=amounts(line);
   if(!values.length&&/^(?:£\s*|GBP\s*)?[\d,.]+(?:\s*GBP)?$/i.test(lines[i+1]||''))values=amounts(lines[i+1]);
   // Conflicting values at the strongest label require a human check.
   if(!values.length)continue;
   if(!ranked.has(rank))ranked.set(rank,new Set());
   for(const value of values)ranked.get(rank).add(value);
  }
  const best=ranked.get(Math.max(...ranked.keys()));
  const value=best?.size===1?[...best][0]:'';
  return pence(value)===null?'':value;
 }
 function parseReceipt(text){
  const lines=text.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);let date='',amount='',description='';
  for(const line of lines){const m=line.match(/\b(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4}|\d{2})\b/);if(m){const y=m[3].length===2?'20'+m[3]:m[3];const v=`${y}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;if(validDate(v)){date=v;break;}}}
  if(!date){const m=text.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);if(m&&validDate(m[0]))date=m[0];}
  const monthNames=['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
  if(!date){const m=text.match(/\b(\d{1,2})\s*[- /]?\s*([A-Za-z]{3,9})\s*[- /]?\s*(\d{4}|\d{2})\b/);if(m){const mo=monthNames.indexOf(m[2].slice(0,3).toLowerCase())+1;const v=`${m[3].length===2?'20'+m[3]:m[3]}-${String(mo).padStart(2,'0')}-${m[1].padStart(2,'0')}`;if(validDate(v))date=v;}}
  amount=receiptTotal(lines);
  description=lines.slice(0,6).find(x=>/[A-Za-z]{3}/.test(x)&&!/^receipt|vat|tel|www\.|http|tax\s|date|thank/i.test(x)&&x.length<81)||'';
  return {date,amount,description};
 }
 function cleanSignature(strokes){if(strokes==null)return [];if(!Array.isArray(strokes)||strokes.length>100)throw Error('Invalid signature in backup.');let count=0;return strokes.map(stroke=>{if(!Array.isArray(stroke)||stroke.length<1||(count+=stroke.length)>20000)throw Error('Invalid signature in backup.');return stroke.map(p=>{if(!p||!Number.isFinite(p.x)||!Number.isFinite(p.y)||p.x<0||p.x>1||p.y<0||p.y>1)throw Error('Invalid signature in backup.');return {x:p.x,y:p.y};});});}
 const api={pence,validDate,validItem,canCreate,claimTypes,mileagePence,itemPence,totals,editItem,parseReceipt,cleanSignature};root.ExpenseCore=api;if(typeof module!=='undefined')module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
