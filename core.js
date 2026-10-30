(function(root){
 'use strict';
 function pence(value){const s=String(value??'').trim();if(!/^\d{1,7}(?:\.\d{1,2})?$/.test(s))return null;const [whole,frac='']=s.split('.');const n=Number(whole)*100+Number(frac.padEnd(2,'0'));return n>0?n:null;}
 function validDate(s){if(!/^\d{4}-\d{2}-\d{2}$/.test(s))return false;const d=new Date(s+'T12:00:00Z');return !isNaN(d)&&d.toISOString().slice(0,10)===s&&Number(s.slice(0,4))>=2000&&Number(s.slice(0,4))<=2100;}
 function validItem(r){return !!r.image&&validDate(r.date)&&!!r.description.trim()&&pence(r.amount)!==null&&!r.reading;}
 function canCreate(s){return !!s.engineer.trim()&&validDate(s.claimDate)&&s.receipts.length>0&&s.receipts.every(r=>r.checked&&validItem(r));}
 function editItem(r,key,value){r[key]=value;r.checked=false;}
 function parseReceipt(text){
  const lines=text.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);let date='',amount='',description='';
  for(const line of lines){const m=line.match(/\b(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4}|\d{2})\b/);if(m){const y=m[3].length===2?'20'+m[3]:m[3];const v=`${y}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;if(validDate(v)){date=v;break;}}}
  if(!date){const m=text.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);if(m&&validDate(m[0]))date=m[0];}
  const monthNames=['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
  if(!date){const m=text.match(/\b(\d{1,2})\s*[- /]?\s*([A-Za-z]{3,9})\s*[- /]?\s*(\d{4}|\d{2})\b/);if(m){const mo=monthNames.indexOf(m[2].slice(0,3).toLowerCase())+1;const v=`${m[3].length===2?'20'+m[3]:m[3]}-${String(mo).padStart(2,'0')}-${m[1].padStart(2,'0')}`;if(validDate(v))date=v;}}
  let best=-1;
  lines.forEach((line,i)=>{if(/subtotal|sub\s+total|vat|tax|change|cashback|saving|discount|tendered/i.test(line))return;let score=/grand\s*total|total\s*(due|paid|amount)|amount\s*(due|paid)|balance\s*due/i.test(line)?4:/\btotal\b/i.test(line)?3:/card|payment/i.test(line)?1:0;if(!score)return;
   let values=line.match(/\d{1,7}[.,]\d{2}\b/g);if(!values&&i+1<lines.length)values=lines[i+1].match(/^\s*[£$€]?\s*(\d{1,7}[.,]\d{2})\s*$/)?.slice(1);
   if(values&&score>=best){const val=values[values.length-1].replace(',','.');if(pence(val)!==null){amount=val;best=score;}}
  });
  description=lines.slice(0,6).find(x=>/[A-Za-z]{3}/.test(x)&&!/^receipt|vat|tel|www\.|http|tax\s|date|thank/i.test(x)&&x.length<81)||'';
  return {date,amount,description};
 }
 function cleanSignature(strokes){if(strokes==null)return [];if(!Array.isArray(strokes)||strokes.length>100)throw Error('Invalid signature in backup.');let count=0;return strokes.map(stroke=>{if(!Array.isArray(stroke)||stroke.length<1||(count+=stroke.length)>20000)throw Error('Invalid signature in backup.');return stroke.map(p=>{if(!p||!Number.isFinite(p.x)||!Number.isFinite(p.y)||p.x<0||p.x>1||p.y<0||p.y>1)throw Error('Invalid signature in backup.');return {x:p.x,y:p.y};});});}
 const api={pence,validDate,validItem,canCreate,editItem,parseReceipt,cleanSignature};root.ExpenseCore=api;if(typeof module!=='undefined')module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
