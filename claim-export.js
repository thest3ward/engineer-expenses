(function(root){
 'use strict';
 const C=root.ExpenseCore, mime='application/vnd.openxmlformats-officedocument.wordprocessingml.document';
 const escape=value=>String(value??'').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[char]));
 const money=pence=>'£'+(pence/100).toFixed(2);
 const date=value=>C.validDate(value)?value.split('-').reverse().join('/'):'Not entered';
 const type=form=>form.paymentType==='card'?'Company credit card expenditure':'Personal expense reimbursement';
 const itemType=item=>item.kind==='mileage'?'Mileage':item.category||'Not entered';
 function amount(item){const n=C.itemPence(item);return n===null?(item.kind==='mileage'?'Accounts to calculate':'Not entered'):money(n);}
 function notes(item){return String(item.description||'').trim()+(item.kind==='mileage'?`\nOwn personal vehicle · ${C.mileageFuels[item.fuel]||'Fuel not selected'} · ${C.mileageBands[item.engineBand]||'Engine size not selected'}\n${item.miles} miles${item.rate?' at £'+item.rate+' per mile':''}`:'');}
 function summary(form){
  const t=C.totals(form);
  const lines=[['Receipts excluding VAT',t.net===null?'VAT selection needed':money(t.net)],['Receipt VAT',t.vat===null?'VAT selection needed':money(t.vat)],['Receipts including VAT',money(t.receipts)]];
  if(t.miles){lines.push(['Personal vehicle mileage',t.miles.toFixed(2)+' miles']);if(t.mileageAmount)lines.push(['Calculated mileage payment',money(t.mileageAmount)]);if(t.pending)lines.push(['Mileage payment','To be calculated by accounts']);}
  lines.push(['Form total'+(t.pending?' before unpriced mileage':''),money(t.total)]);
  lines.push(['Owed to employee'+(t.pending&&form.paymentType!=='card'?' before mileage payment':''),money(t.owed)]);
  return lines;
 }
 function signature(strokes){
  if(!strokes?.length)return null;
  // A small PNG is generated without a canvas so exports can be tested outside a browser too.
  const width=600,height=120,pixels=new Uint8Array(width*height*4);pixels.fill(255);
  const points=strokes.flat(),minX=Math.min(...points.map(p=>p.x)),maxX=Math.max(...points.map(p=>p.x)),minY=Math.min(...points.map(p=>p.y)),maxY=Math.max(...points.map(p=>p.y));
  const scale=Math.min((width-10)/Math.max(1,(maxX-minX)*1000),(height-10)/Math.max(1,(maxY-minY)*400));
  const point=p=>({x:5+(p.x-minX)*1000*scale,y:5+(p.y-minY)*400*scale});
  function dot(x,y){for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++){const px=Math.round(x)+dx,py=Math.round(y)+dy;if(px<0||px>=width||py<0||py>=height)continue;const i=(py*width+px)*4;pixels[i]=24;pixels[i+1]=52;pixels[i+2]=64;}}
  for(const stroke of strokes){dot(point(stroke[0]).x,point(stroke[0]).y);for(let i=1;i<stroke.length;i++){const a=point(stroke[i-1]),b=point(stroke[i]),steps=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.y-a.y)));for(let j=0;j<=steps;j++)dot(a.x+(b.x-a.x)*j/steps,a.y+(b.y-a.y)*j/steps);}}
  // Stored DEFLATE blocks avoid adding a second image/compression dependency.
  const raw=new Uint8Array(height*(width*4+1));for(let y=0;y<height;y++)raw.set(pixels.subarray(y*width*4,(y+1)*width*4),y*(width*4+1)+1);
  const parts=[new Uint8Array([120,1])];let a=1,b=0;
  for(const byte of raw){a=(a+byte)%65521;b=(b+a)%65521;}
  for(let offset=0;offset<raw.length;offset+=65535){const block=raw.subarray(offset,offset+65535),n=block.length;parts.push(new Uint8Array([offset+n===raw.length?1:0,n&255,n>>>8,(~n)&255,((~n)>>>8)&255]),block);}
  const integer=n=>new Uint8Array([n>>>24,(n>>>16)&255,(n>>>8)&255,n&255]);
  parts.push(integer(((b<<16)|a)>>>0));
  const join=list=>{const out=new Uint8Array(list.reduce((sum,p)=>sum+p.length,0));let offset=0;for(const p of list){out.set(p,offset);offset+=p.length;}return out;};
  function chunk(type,data){const bytes=join([new TextEncoder().encode(type),data]);let crc=0xffffffff;for(const byte of bytes){crc^=byte;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return join([integer(data.length),bytes,integer((crc^0xffffffff)>>>0)]);}
  return join([new Uint8Array([137,80,78,71,13,10,26,10]),chunk('IHDR',join([integer(width),integer(height),new Uint8Array([8,6,0,0,0])])),chunk('IDAT',join(parts)),chunk('IEND',new Uint8Array())]);
 }
 function mileageTable(items){
  const widths=[1300,4317,1300,2089],rows=[['Date','Journey / personal vehicle','Miles','Payment'],...items.map(item=>[date(item.date),notes(item),item.miles,amount(item)])];
  return '<w:tbl><w:tblPr><w:tblW w:w="9006" w:type="dxa"/><w:tblLayout w:type="fixed"/><w:tblBorders>'+['top','left','bottom','right','insideH','insideV'].map(edge=>`<w:${edge} w:val="single" w:sz="8" w:color="9BBB59"/>`).join('')+'</w:tblBorders></w:tblPr><w:tblGrid>'+widths.map(width=>`<w:gridCol w:w="${width}"/>`).join('')+'</w:tblGrid>'+rows.map((row,index)=>'<w:tr><w:trPr><w:cantSplit/>'+(index===0?'<w:tblHeader/>':'')+'</w:trPr>'+row.map((value,column)=>`<w:tc><w:tcPr><w:tcW w:w="${widths[column]}" w:type="dxa"/><w:shd w:fill="${index%2===0?'E7EFD7':'FFFFFF'}"/></w:tcPr><w:p><w:pPr><w:spacing w:before="50" w:after="50"/></w:pPr><w:r><w:rPr><w:sz w:val="18"/>${index===0?'<w:b/>':''}</w:rPr><w:t xml:space="preserve">${escape(value).replace(/\n/g,'</w:t><w:br/><w:t xml:space="preserve">')}</w:t></w:r></w:p></w:tc>`).join('')+'</w:tr>').join('')+'</w:tbl>';
 }
 async function word(form,templateBytes){
  if(!C.canCreate(form))throw Error('Complete and check every expense before downloading the Word claim.');
  if(!templateBytes){const response=await fetch('claim-template.docx?v=vat-1');if(!response.ok)throw Error('Could not load the claim form. Please check your connection and try again.');templateBytes=await response.arrayBuffer();}
  const zip=await root.JSZip.loadAsync(templateBytes),sig=signature(C.cleanSignature(form.signature)),t=C.totals(form);
  let xml=await zip.file('word/document.xml').async('string');
  const fill=(text,values)=>text.replace(/\{\{([A-Z_]+)\}\}/g,(marker,key)=>Object.hasOwn(values,key)?escape(values[key]).replace(/\r?\n/g,'</w:t><w:br/><w:t xml:space="preserve">'):marker);
  const row=xml.match(/<w:tr\b[^>]*>[\s\S]*?<\/w:tr>/g).find(value=>value.includes('{{ITEM_DATE}}'));
  // Keep the original writing grid, allowing long entries to grow naturally.
  const photos=form.receipts.map((item,index)=>({item,index})).filter(({item})=>item.kind!=='mileage'),mileage=form.receipts.filter(item=>item.kind==='mileage');
  const rows=photos.map(({item,index})=>{const vat=C.vatBreakdown(item);return fill(row,{ITEM_DATE:date(item.date),ITEM_TYPE:itemType(item),ITEM_NOTES:(index+1)+'. '+notes(item)+(item.vatMode==='none'?'\nNo VAT claimed':item.vatMode==='custom'?'\nCustom VAT':''),ITEM_NET:money(vat.net),ITEM_VAT:money(vat.vat),ITEM_AMOUNT:money(vat.gross)});});
  const extraLines=photos.reduce((sum,{item})=>sum+Math.max(0,Math.ceil(itemType(item).length/16)-1,Math.ceil(notes(item).length/36)-1)+(item.vatMode==='standard'?0:1),0);
  while(rows.length<Math.max(photos.length,(mileage.length?8:13)-extraLines))rows.push(fill(row,{ITEM_DATE:'',ITEM_TYPE:'',ITEM_NOTES:'',ITEM_NET:'',ITEM_VAT:'',ITEM_AMOUNT:''}));
  xml=xml.replace(row,rows.map((value,index)=>value.replace(/w:fill="D3DFEE"/g,'w:fill="'+(index%2===0?'D3DFEE':'FFFFFF')+'"')).join(''));
  const mileageSection=mileage.length?'<w:p><w:pPr><w:keepNext/><w:spacing w:before="160" w:after="80"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="22"/></w:rPr><w:t>Personal vehicle mileage</w:t></w:r></w:p>'+mileageTable(mileage)+'<w:p><w:pPr><w:spacing w:after="80"/></w:pPr></w:p>':'';
  xml=xml.replace('<w:p><w:r><w:t>{{MILEAGE_SECTION}}</w:t></w:r></w:p>',mileageSection);
  xml=fill(xml,{ENGINEER:form.engineer,DATE:date(form.claimDate),REFERENCE:form.reference,FORM_TYPE:type(form),TOTAL_LABEL:form.paymentType==='card'?'TOTAL COMPANY CARD EXPENDITURE':'TOTAL CLAIMED BY EMPLOYEE',TOTAL:money(t.total)+(t.pending?' *':''),OWED:money(t.owed)+(t.pending&&form.paymentType!=='card'?' *':''),MILES:t.miles.toFixed(2),MILEAGE_PAYMENT:t.pending?'Accounts to calculate':money(t.mileageAmount),NET:money(t.net),VAT:money(t.vat),RECEIPTS:money(t.receipts),ATTACHMENTS:(photos.length?'Receipts: '+form.reference+'-receipts.pdf. Item numbers match the notes.':'Personal vehicle mileage only.')+(t.pending?' * Mileage payment to be added by accounts.':'')});
  let drawing='';
  if(sig){
   drawing='<w:r><w:drawing xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="1143000" cy="228600"/><wp:docPr id="201" name="Employee signature" descr="Employee drawn signature"/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="201" name="Employee signature"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="expenseSignature"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="1143000" cy="228600"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>';
   let rels=await zip.file('word/_rels/document.xml.rels').async('string');
   zip.file('word/_rels/document.xml.rels',rels.replace('</Relationships>','<Relationship Id="expenseSignature" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/expense-signature.png"/></Relationships>'));
   let types=await zip.file('[Content_Types].xml').async('string');
   if(!/Extension="png"/.test(types))zip.file('[Content_Types].xml',types.replace('</Types>','<Default Extension="png" ContentType="image/png"/></Types>'));
   zip.file('word/media/expense-signature.png',sig);
  }
  xml=xml.replace(/<w:r><w:t>\{\{SIGNATURE\}\}<\/w:t><\/w:r>/,drawing);
  if(/\{\{[A-Z_]+\}\}/.test(xml))throw Error('The claim form could not be completed.');
  zip.file('word/document.xml',xml);
  return new Blob([await zip.generateAsync({type:'uint8array',compression:'DEFLATE'})],{type:mime});
 }
 function receiptPDF(form,{preview=false}={}){
  if(!preview&&!C.canCreate(form))throw Error('Complete and check every expense before downloading receipts.');
  const photos=form.receipts.map((item,index)=>({item,index})).filter(({item})=>item.kind!=='mileage');
  if(!photos.length)throw Error('This mileage-only form has no receipt photographs.');
  const pdf=new root.jspdf.jsPDF({unit:'mm',format:'a4',compress:true});
  for(const [page,{item,index}] of photos.entries()){
   if(page)pdf.addPage();
   pdf.setFont('helvetica','bold');pdf.setFontSize(18);pdf.text('Supporting receipt '+(index+1),17,22);
   pdf.setFont('helvetica','normal');pdf.setFontSize(9);pdf.text(form.reference,17,31);pdf.text(type(form),17,38);
   const vat=C.vatBreakdown(item),vatLine=vat?'Ex VAT '+money(vat.net)+' | VAT '+money(vat.vat)+' | Inc VAT '+money(vat.gross):'VAT selection needed';
   const title=pdf.splitTextToSize(date(item.date)+' | '+itemType(item)+' | '+amount(item)+'\n'+String(item.description||'')+'\n'+vatLine,176);
   pdf.text(title,17,46);const top=52+title.length*4,props=pdf.getImageProperties(item.image),scale=Math.min(176/props.width,(274-top)/props.height),width=props.width*scale,height=props.height*scale;
   pdf.addImage(item.image,'JPEG',(210-width)/2,top,width,height,undefined,'FAST');
   if(preview&&!(item.checked&&C.validItem(item))){pdf.setTextColor(210,25,25);pdf.setFontSize(28);pdf.text('NOT CHECKED',105,top+height/2,{align:'center',angle:25});pdf.setTextColor(0);}
   pdf.setFontSize(8);pdf.text(form.reference,17,288);pdf.text((page+1)+' / '+photos.length,193,288,{align:'right'});
  }
  pdf.setProperties({title:form.reference+' Supporting receipts',subject:type(form)});return pdf;
 }
 function preview(form){
  const rows=form.receipts.map((item,i)=>{if(item.kind==='mileage')return '';const vat=C.vatBreakdown(item);return `<tr><td>${i+1}</td><td>${date(item.date)}</td><td>${escape(itemType(item))}</td><td>${escape(notes(item)).replace(/\n/g,'<br>')}${item.vatMode==='none'?'<br>No VAT claimed':''}</td><td>${vat?money(vat.net):'Not checked'}</td><td>${vat?money(vat.vat):'Not checked'}</td><td>${escape(amount(item))}</td><td>${item.checked&&C.validItem(item)?'Checked':'NOT CHECKED'}</td></tr>`;}).join('');
  const miles=form.receipts.filter(item=>item.kind==='mileage');
  const mileage=miles.length?'<h2>Personal vehicle mileage</h2><div class="table-wrap"><table><thead><tr><th>Date</th><th>Journey</th><th>Miles</th><th>Payment</th><th>Review</th></tr></thead><tbody>'+miles.map(item=>`<tr><td>${date(item.date)}</td><td>${escape(notes(item)).replace(/\n/g,'<br>')}</td><td>${escape(item.miles)}</td><td>${escape(amount(item))}</td><td>${item.checked&&C.validItem(item)?'Checked':'NOT CHECKED'}</td></tr>`).join('')+'</tbody></table></div>':'';
  const photos=form.receipts.map((item,i)=>item.kind==='mileage'?'':`<figure><figcaption>Receipt ${i+1}</figcaption>${item.checked&&C.validItem(item)?'':'<strong class="stamp">NOT CHECKED</strong>'}<img alt="Receipt ${i+1}" src="${escape(item.image)}"></figure>`).join('');
  return `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Claim preview</title><style>body{font:16px Arial;color:#183440;max-width:1000px;margin:24px auto;padding:16px}table{width:100%;border-collapse:collapse}td,th{padding:10px;border:1px solid #ccc;text-align:left;overflow-wrap:anywhere}figure{position:relative;margin:24px 0}img{max-width:100%;max-height:1000px}.stamp{color:#d11919;position:absolute;top:50%;left:20%;font-size:36px;transform:rotate(-20deg)}.table-wrap{overflow:auto}.draft{color:#b9271a}</style></head><body><p class="draft">PREVIEW — NOT FOR SUBMISSION</p><h1>${type(form)}</h1><p>${escape(form.reference)}</p><p>${escape(form.engineer||'Name not entered')} · ${date(form.claimDate)}</p><div class="table-wrap"><table><thead><tr><th>Item</th><th>Date</th><th>Expense Type</th><th>Notes</th><th>Ex VAT</th><th>VAT</th><th>Inc VAT</th><th>Review</th></tr></thead><tbody>${rows}</tbody></table></div>${mileage}${summary(form).map(([label,value])=>`<p><b>${escape(label)}</b> ${escape(value)}</p>`).join('')}${photos}</body></html>`;
 }
 root.ClaimExport={word,receiptPDF,preview,summary};if(typeof module!=='undefined')module.exports=root.ClaimExport;
})(typeof globalThis!=='undefined'?globalThis:this);
