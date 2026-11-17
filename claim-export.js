(function(root){
 'use strict';
 const C=root.ExpenseCore, mime='application/vnd.openxmlformats-officedocument.wordprocessingml.document';
 const escape=value=>String(value??'').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[char]));
 const money=pence=>'£'+(pence/100).toFixed(2);
 const date=value=>C.validDate(value)?value.split('-').reverse().join('/'):'Not entered';
 const type=form=>form.paymentType==='card'?'Company credit card expenditure':'Personal expense reimbursement';
 const itemType=item=>item.kind==='mileage'?'Mileage':item.category||'Not entered';
 function amount(item){const n=C.itemPence(item);return n===null?(item.kind==='mileage'?'Accounts to calculate':'Not entered'):money(n);}
 function notes(item){return String(item.description||'').trim()+(item.kind==='mileage'?`\nOwn personal vehicle · ${item.miles} miles${item.rate?' at £'+item.rate+' per mile':''}`:'');}
 function summary(form){
  const t=C.totals(form);
  const lines=[['Receipt expenditure',money(t.receipts)]];
  if(t.miles){lines.push(['Personal vehicle mileage',t.miles.toFixed(2)+' miles']);if(t.mileageAmount)lines.push(['Calculated mileage payment',money(t.mileageAmount)]);if(t.pending)lines.push(['Mileage payment','To be calculated by accounts']);}
  lines.push(['Form total'+(t.pending?' before unpriced mileage':''),money(t.total)]);
  lines.push(['Owed to employee'+(t.pending&&form.paymentType!=='card'?' before mileage payment':''),money(t.owed)]);
  return lines;
 }
 function paragraph(text,{bold=false,size=22,style='',after=100}={}){
  const properties=`<w:pPr>${style?'<w:pStyle w:val="'+style+'"/>':''}<w:spacing w:after="${after}"/></w:pPr>`;
  return `<w:p>${properties}<w:r><w:rPr>${bold?'<w:b/>':''}<w:sz w:val="${size}"/><w:color w:val="000000"/></w:rPr>${String(text).split(/\r?\n/).map((line,i)=>(i?'<w:br/>':'')+'<w:t xml:space="preserve">'+escape(line)+'</w:t>').join('')}</w:r></w:p>`;
 }
 function table(rows){
  const widths=[500,1400,1400,5000,1700];
  const borders=['top','left','bottom','right','insideH','insideV'].map(edge=>`<w:${edge} w:val="single" w:sz="4" w:color="D9D9D9"/>`).join('');
  return `<w:tbl><w:tblPr><w:tblW w:w="10000" w:type="dxa"/><w:tblLayout w:type="fixed"/><w:tblBorders>${borders}</w:tblBorders><w:tblCellMar><w:top w:w="90" w:type="dxa"/><w:left w:w="100" w:type="dxa"/><w:bottom w:w="90" w:type="dxa"/><w:right w:w="100" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>${widths.map(width=>`<w:gridCol w:w="${width}"/>`).join('')}</w:tblGrid>${rows.map((row,index)=>`<w:tr>${'<w:trPr><w:cantSplit/>'+(index===0?'<w:tblHeader/>':'')+'</w:trPr>'}${row.map((value,column)=>`<w:tc><w:tcPr><w:tcW w:w="${widths[column]}" w:type="dxa"/><w:vAlign w:val="center"/>${index===0?'<w:shd w:fill="E8EEEA"/>':''}</w:tcPr>${paragraph(value,{bold:index===0,size:20,after:50})}</w:tc>`).join('')}</w:tr>`).join('')}</w:tbl>`;
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
 async function word(form){
  if(!C.canCreate(form))throw Error('Complete and check every expense before downloading the Word claim.');
  const zip=new root.JSZip(),sig=signature(C.cleanSignature(form.signature));
  const rows=[['#','Date','Expense Type','Notes and journey details','Amount'],...form.receipts.map((item,index)=>[String(index+1),date(item.date),itemType(item),notes(item),amount(item)])];
  let content=paragraph(type(form),{style:'Title',size:34,after:200})+paragraph('Claim reference '+form.reference,{size:20})+paragraph('Engineer '+form.engineer)+paragraph('Claim date '+date(form.claimDate),{after:200})+table(rows)+paragraph('',{after:80});
  for(const [label,value] of summary(form))content+=paragraph(label+'    '+value,{bold:true});
  content+=paragraph('Employee signature',{after:80});
  if(sig)content+='<w:p><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="2743200" cy="548640"/><wp:docPr id="1" name="Employee signature" descr="Employee drawn signature"/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="1" name="Employee signature"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="signature"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="2743200" cy="548640"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>';
  else content+=paragraph('________________________________________');
  content+=paragraph('Approved by accounts    ______________________________')+paragraph('Approved by manager    ______________________________')+paragraph('Total approved by accounts    £ ________________________')+paragraph('Total to be reimbursed    £ ____________________________');
  const photographs=form.receipts.filter(r=>r.kind!=='mileage').length;
  content+=paragraph(photographs?'Supporting photographs are in '+form.reference+'-receipts.pdf. Expense item numbers match this form.':'This form contains personal vehicle mileage only.',{size:18});
  const namespaces='xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"';
  zip.file('word/document.xml',`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${namespaces}><w:body>${content}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="963" w:right="953" w:bottom="963" w:left="953"/></w:sectPr></w:body></w:document>`);
  zip.file('word/styles.xml','<?xml version="1.0" encoding="UTF-8"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:sz w:val="22"/><w:color w:val="000000"/></w:rPr></w:rPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style><w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:pPr><w:keepNext/></w:pPr><w:rPr><w:b/><w:sz w:val="34"/><w:color w:val="000000"/></w:rPr></w:style></w:styles>');
  zip.file('[Content_Types].xml','<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>');
  zip.file('_rels/.rels','<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="document" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
  zip.file('word/_rels/document.xml.rels',`<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="styles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>${sig?'<Relationship Id="signature" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/signature.png"/>':''}</Relationships>`);
  if(sig)zip.file('word/media/signature.png',sig);
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
   const title=pdf.splitTextToSize(date(item.date)+' | '+itemType(item)+' | '+amount(item)+'\n'+String(item.description||''),176);
   pdf.text(title,17,46);const top=52+title.length*4,props=pdf.getImageProperties(item.image),scale=Math.min(176/props.width,(274-top)/props.height),width=props.width*scale,height=props.height*scale;
   pdf.addImage(item.image,'JPEG',(210-width)/2,top,width,height,undefined,'FAST');
   if(preview&&!(item.checked&&C.validItem(item))){pdf.setTextColor(210,25,25);pdf.setFontSize(28);pdf.text('NOT CHECKED',105,top+height/2,{align:'center',angle:25});pdf.setTextColor(0);}
   pdf.setFontSize(8);pdf.text(form.reference,17,288);pdf.text((page+1)+' / '+photos.length,193,288,{align:'right'});
  }
  pdf.setProperties({title:form.reference+' Supporting receipts',subject:type(form)});return pdf;
 }
 function preview(form){
  const rows=form.receipts.map((item,i)=>`<tr><td>${i+1}</td><td>${date(item.date)}</td><td>${escape(itemType(item))}</td><td>${escape(notes(item)).replace(/\n/g,'<br>')}</td><td>${escape(amount(item))}</td><td>${item.checked&&C.validItem(item)?'Checked':'NOT CHECKED'}</td></tr>`).join('');
  const photos=form.receipts.map((item,i)=>item.kind==='mileage'?'':`<figure><figcaption>Receipt ${i+1}</figcaption>${item.checked&&C.validItem(item)?'':'<strong class="stamp">NOT CHECKED</strong>'}<img alt="Receipt ${i+1}" src="${escape(item.image)}"></figure>`).join('');
  return `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Claim preview</title><style>body{font:16px Arial;color:#183440;max-width:1000px;margin:24px auto;padding:16px}table{width:100%;border-collapse:collapse}td,th{padding:10px;border:1px solid #ccc;text-align:left;overflow-wrap:anywhere}figure{position:relative;margin:24px 0}img{max-width:100%;max-height:1000px}.stamp{color:#d11919;position:absolute;top:50%;left:20%;font-size:36px;transform:rotate(-20deg)}.table-wrap{overflow:auto}.draft{color:#b9271a}</style></head><body><p class="draft">PREVIEW — NOT FOR SUBMISSION</p><h1>${type(form)}</h1><p>${escape(form.reference)}</p><p>${escape(form.engineer||'Name not entered')} · ${date(form.claimDate)}</p><div class="table-wrap"><table><thead><tr><th>Item</th><th>Date</th><th>Expense Type</th><th>Notes</th><th>Amount</th><th>Review</th></tr></thead><tbody>${rows}</tbody></table></div>${summary(form).map(([label,value])=>`<p><b>${escape(label)}</b> ${escape(value)}</p>`).join('')}${photos}</body></html>`;
 }
 root.ClaimExport={word,receiptPDF,preview,summary};if(typeof module!=='undefined')module.exports=root.ClaimExport;
})(typeof globalThis!=='undefined'?globalThis:this);
