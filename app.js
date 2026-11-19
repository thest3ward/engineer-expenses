'use strict';
const C=ExpenseCore,$=s=>document.querySelector(s),money=n=>new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP'}).format(n/100);
const today=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
let workspace=ClaimForms.load(null,{date:today()});
let state=workspace.forms[0],legacySnapshot=null,db,worker,readingId=null,readToken=0,saving=Promise.resolve(),saveFailed=false,noticeTimer,pdfSaving=false,pendingPDF=null;
const expandedReceipts=new Set();
let importingPhotos=false;
let cancelCurrentRead=null;
const escapeHtml=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function notify(message,error=false){$('#notice').textContent=message;$('#notice').className=error?'error':'';$('#notice').hidden=false;clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>$('#notice').hidden=true,error?12000:5500);}
function requestResult(req){return new Promise((resolve,reject)=>{req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});}
async function init(){
 try{const req=indexedDB.open('engineer-expenses',1);req.onupgradeneeded=()=>req.result.createObjectStore('draft');db=await requestResult(req);const saved=await requestResult(db.transaction('draft').objectStore('draft').get('current'));if(saved){workspace=ClaimForms.load(saved,{date:today()});state=workspace.forms.find(f=>f.id===workspace.activeFormId);if(saved.version!==2)legacySnapshot=structuredClone(saved);}$('#save-status').textContent='Draft saved on this device';}
 catch(e){saveFailed=true;$('#save-status').textContent='Draft saving unavailable';notify('This browser cannot save your draft. Export a backup before closing.',true);}
 showForm();if(legacySnapshot)save();
}
function save(){
 const snapshot=structuredClone(workspace);if(!db)return;
 $('#save-status').textContent='Saving…';
 saving=saving.catch(()=>{}).then(()=>new Promise((resolve,reject)=>{const tx=db.transaction('draft','readwrite');tx.objectStore('draft').put(snapshot,'current');if(legacySnapshot)tx.objectStore('draft').put(legacySnapshot,'before-multiple-forms');tx.oncomplete=()=>{legacySnapshot=null;resolve();};tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);})).then(()=>{saveFailed=false;$('#save-status').textContent='Draft saved on this device';}).catch(()=>{saveFailed=true;$('#save-status').textContent='Not saved — export a backup';notify('Could not save the draft. Storage may be full. Export a backup before closing.',true);});
}
function summary(){
 const count=state.receipts.length,checked=state.receipts.filter(r=>r.checked&&C.validItem(r)).length;
 const totals=C.totals(state),adding=importingPhotos||!!readingId,busy=adding||pdfSaving;
 $('#total').textContent=money(totals.total);
 $('#receipt-count').textContent=count;
 $('#items-summary').textContent=count?`${count} expense${count===1?'':'s'} · GBP`:'No expenses yet';
 $('#owed-summary').textContent=state.paymentType==='card'?'Owed to employee: '+money(0):`Owed to employee${totals.pending?' before mileage payment':''}: ${money(totals.owed)}`;
 $('#mileage-summary').textContent=totals.miles?`${totals.miles.toFixed(2)} miles${totals.pending?' · payment to be calculated by accounts':' · '+money(totals.mileageAmount)}`:'';
 $('#checked-count').textContent=`${checked} / ${count}`;$('#checked-progress').max=count||1;$('#checked-progress').value=checked;
 let message=!count?'Add your first expense to get started.':checked<count?`${count-checked} expense${count-checked===1?' needs':'s need'} completing and checking.`:!state.engineer.trim()?'Enter the engineer’s name above.':!C.validDate(state.claimDate)?'Enter a valid claim date.':'All expenses checked. This form is ready.';
 if(readingId)message='Finish reading or choose Enter manually, then check the item.';
 else if(importingPhotos)message='Adding receipt photos…';
 $('#gate-message').textContent=message;
 $('#create-claim').disabled=!C.canCreate(state)||busy;
 $('#download-receipts').disabled=!C.canCreate(state)||busy||!state.receipts.some(r=>r.kind!=='mileage');
 $('#preview-claim').disabled=!count||pdfSaving;
 for(const id of ['camera','upload','another-camera','another-upload','add-mileage'])$('#'+id).disabled=busy;
 for(const id of ['new-claim','restore','form-select','add-form'])$('#'+id).disabled=busy;
 $('#add-another').hidden=!count;
 $('#mileage-tools').hidden=state.paymentType==='card';
 renderFormControls();
}
function renderFormControls(){
 $('#form-select').innerHTML=workspace.forms.map((form,i)=>`<option value="${escapeHtml(form.id)}">${i+1}. ${form.paymentType==='card'?'Company card':'Personal'} · ${dateText(form.claimDate)}</option>`).join('');
 $('#form-select').value=state.id;
 $('#form-reference').textContent=state.reference;
 $('#form-purpose').textContent=state.paymentType==='card'?'Company credit card expenditure':'Personal expense reimbursement';
}
function showForm(){
 signatureEditing=false;signaturePointer=null;
 $('#engineer').value=state.engineer;$('#claim-date').value=state.claimDate;
 expandedReceipts.clear();render();renderSignature();
}
function fieldsValidation(r,element){
 if(r.kind==='mileage')for(const key of ['fuel','engineBand']){const field=element.querySelector(`[data-field="${key}"]`),choices=key==='fuel'?C.mileageFuels:C.mileageBands;if(field){const invalid=!Object.hasOwn(choices,r[key]);field.classList.toggle('missing-field',invalid);field.setAttribute('aria-invalid',String(invalid));}}
 const vat=element.querySelector('.vat-options');if(vat){const missing=!['none','standard','custom'].includes(r.vatMode);vat.classList.toggle('missing-field',missing);vat.setAttribute('aria-invalid',String(missing));}
 const custom=element.querySelector('[data-field="vatAmount"]');if(custom){const invalid=r.vatMode==='custom'&&C.vatBreakdown(r)===null;custom.classList.toggle('missing-field',invalid);custom.setAttribute('aria-invalid',String(invalid));}
 for(const key of ['category','description']){
  const field=element.querySelector(`[data-field="${key}"]`);
  if(!field)continue;
  const missing=key==='category'?!C.claimTypes.includes(r.category):!r.description.trim();
  field.classList.toggle('missing-field',missing);
  field.setAttribute('aria-invalid',String(missing));
 }
}
function receiptDescription(r){
 const category=C.claimTypes.includes(r.category)?r.category:'';
 return [category,r.description.trim()].filter(Boolean).join(' - ');
}
function card(r,i){
 if(r.kind==='mileage')return mileageCard(r,i);
 const number=String(i+1).padStart(2,'0');
 const checked=r.checked&&C.validItem(r), collapsed=checked&&!expandedReceipts.has(r.id);
 const detailsId='receipt-details-'+r.id;
 const summary=r.category||r.description.trim()||'Receipt '+number;
 const choices=C.claimTypes.filter(type=>type!=='Food'||r.category==='Food');
 const options=choices.map(type=>`<option${r.category===type?' selected':''}>${type}</option>`).join('');
 return `<article class="receipt ${checked?'checked':''}" data-id="${r.id}">
 <div class="receipt-top" ${collapsed?'hidden':''}><h3>Receipt ${number}</h3><span class="badge">${r.reading?'Reading…':checked?'Checked':'Needs checking'}</span></div>
 <button type="button" class="receipt-toggle" data-action="toggle" aria-controls="${detailsId}" aria-expanded="${!collapsed}" ${checked?'':'hidden'}>
 <span class="receipt-toggle-label"><span aria-hidden="true">✓</span> ${escapeHtml(summary)}</span>
 <span>${dateText(r.date)}</span><strong>${checked?money(C.pence(r.amount)):''}</strong><span aria-hidden="true">${collapsed?'▾':'▴'}</span>
 </button>
 <div id="${detailsId}" class="receipt-details" ${collapsed?'hidden':''}>
 <div class="receipt-content"><div><button class="thumbnail" data-action="view" aria-label="View receipt ${i+1}"><img src="${r.image}" alt="Receipt ${i+1}"></button>
 <div class="image-tools"><button class="text-button" data-action="rotate" ${r.reading?'disabled':''}>Rotate</button><button class="text-button remove" data-action="remove" ${r.reading?'disabled':''}>Remove</button></div></div>
 <div class="expense-fields">
 <label>Date<input type="date" data-field="date" value="${escapeHtml(r.date)}" aria-label="Date for receipt ${i+1}"></label>
 <label>Amount incl. VAT (£)<input type="text" inputmode="decimal" data-field="amount" maxlength="10" placeholder="0.00" value="${escapeHtml(r.amount)}" aria-label="Amount including VAT for receipt ${i+1}"></label>
 <label class="description">Expense Type (required)<select required data-field="category" aria-label="Expense Type for receipt ${i+1}"><option value="">Select a type</option>${options}</select></label>
 <label class="description">Notes (required)<input type="text" required maxlength="160" data-field="description" placeholder="e.g. Parking at site" value="${escapeHtml(r.description)}" aria-label="Notes for receipt ${i+1}"></label>
 <fieldset class="vat-options description"><legend>VAT (choose one)</legend><div class="vat-buttons">${[['none','No VAT'],['standard','20% VAT shown'],['custom','Custom VAT']].map(([value,label])=>`<button type="button" data-action="vat" data-vat="${value}" aria-pressed="${r.vatMode===value}">${label}</button>`).join('')}</div>
 <label class="custom-vat" ${r.vatMode==='custom'?'':'hidden'}>VAT amount shown on receipt (£)<input type="text" inputmode="decimal" data-field="vatAmount" maxlength="10" placeholder="0.00" value="${escapeHtml(r.vatAmount||'')}" aria-label="Custom VAT amount for receipt ${i+1}"></label>
 <p class="vat-breakdown">${vatText(r)}</p></fieldset>
 </div></div>
 <label class="check"><input type="checkbox" data-action="check" ${checked?'checked':''} ${C.validItem(r)?'':'disabled'}>I’ve checked the photo, date, claim details and amount.</label>
 <p class="receipt-hint">${escapeHtml(r.note||'Fill in the details, then check this item.')} <button class="text-button" data-action="read" ${readingId||importingPhotos?'disabled':''}>Read photo again</button></p>
 </div></article>`;
}
function render(){const focusId=document.activeElement?.closest('[data-id]')?.dataset.id,field=document.activeElement?.dataset.field;$('#receipts').innerHTML=state.receipts.map(card).join('');$('#empty').hidden=!!state.receipts.length;$('#receipts').querySelectorAll('[data-id]').forEach(el=>{const r=state.receipts.find(r=>r.id===el.dataset.id);fieldsValidation(r,el);});summary();if(focusId&&field)$(`[data-id="${focusId}"] [data-field="${field}"]`)?.focus();}
function vatText(r){const value=C.vatBreakdown(r);return value?`Ex VAT ${money(value.net)} · VAT ${money(value.vat)} · Inc VAT ${money(value.gross)}`:r.vatMode==='custom'?'Enter the receipt’s VAT amount, between £0.00 and the total.':'Choose how VAT is shown on this receipt.';}
function updateCard(r){const el=$(`[data-id="${r.id}"]`);el.classList.toggle('checked',r.checked);el.querySelector('.badge').textContent=r.checked?'Checked':'Needs checking';el.querySelector('.receipt-toggle').hidden=!r.checked;const check=el.querySelector('[data-action="check"]');check.checked=r.checked;check.disabled=!C.validItem(r);fieldsValidation(r,el);if(r.kind==='mileage')el.querySelector('.mileage-value').textContent=mileageValue(r);else el.querySelector('.vat-breakdown').textContent=vatText(r);summary();}
$('#engineer').addEventListener('input',e=>{state.engineer=e.target.value;summary();save();});
$('#claim-date').addEventListener('input',e=>{state.claimDate=e.target.value;summary();save();});
const signaturePad=$('#signature-pad');let signaturePointer=null,signatureEditing=false;
function renderSignature(){const ctx=signaturePad.getContext('2d');ctx.clearRect(0,0,signaturePad.width,signaturePad.height);ctx.strokeStyle='#183440';ctx.fillStyle='#183440';ctx.lineWidth=4;ctx.lineCap='round';ctx.lineJoin='round';for(const stroke of state.signature||[]){if(!stroke.length)continue;ctx.beginPath();ctx.moveTo(stroke[0].x*1000,stroke[0].y*400);for(const p of stroke.slice(1))ctx.lineTo(p.x*1000,p.y*400);if(stroke.length===1){ctx.arc(stroke[0].x*1000,stroke[0].y*400,2,0,Math.PI*2);ctx.fill();}else ctx.stroke();}const added=!!state.signature?.length;signaturePad.classList.toggle('signature-locked',!signatureEditing);signaturePad.setAttribute('aria-label',signatureEditing?'Draw your signature here':'Signature preview, drawing locked');$('#signature-status').textContent=signatureEditing?'Drawing enabled':added?'Signature locked':'Not added';$('#signature-help').textContent=signatureEditing?'Draw your signature, then tap Done to lock it.':'Your signature is protected while you swipe. Tap '+(added?'Edit signature':'Start signature')+' to draw.';$('#signature-prompt').textContent=signatureEditing?'Tap Done when finished':added?'Locked - safe to swipe':'Drawing locked';$('#edit-signature').textContent=added?'Edit signature':'Start signature';$('#edit-signature').hidden=signatureEditing;$('#lock-signature').hidden=!signatureEditing;$('#lock-signature').disabled=signaturePointer!==null;$('#clear-signature').hidden=!signatureEditing;$('#clear-signature').disabled=!added||signaturePointer!==null;}
function signaturePoint(e){const r=signaturePad.getBoundingClientRect();return {x:Math.max(0,Math.min(1,(e.clientX-r.left)/r.width)),y:Math.max(0,Math.min(1,(e.clientY-r.top)/r.height))};}
signaturePad.onpointerdown=e=>{if(!signatureEditing||!e.isPrimary||e.button!==0||signaturePointer!==null)return;e.preventDefault();state.signature??=[];if(state.signature.length>=100){notify('Signature pad is full. Clear it to start again.');return;}signaturePointer=e.pointerId;signaturePad.setPointerCapture(e.pointerId);state.signature.push([signaturePoint(e)]);renderSignature();};
signaturePad.onpointermove=e=>{if(!signatureEditing||e.pointerId!==signaturePointer)return;e.preventDefault();const stroke=state.signature.at(-1);for(const p of e.getCoalescedEvents?.()||[e]){if(state.signature.reduce((n,s)=>n+s.length,0)>=20000)break;stroke.push(signaturePoint(p));}renderSignature();};
function finishSignature(e){if(e.pointerId!==signaturePointer)return;signaturePointer=null;renderSignature();save();}
signaturePad.onpointerup=finishSignature;signaturePad.onpointercancel=finishSignature;signaturePad.onlostpointercapture=finishSignature;
$('#edit-signature').onclick=()=>{signatureEditing=true;renderSignature();};
$('#lock-signature').onclick=()=>{if(signaturePointer!==null)return;signatureEditing=false;renderSignature();save();};
$('#clear-signature').onclick=()=>{if(!signatureEditing||signaturePointer!==null)return;state.signature=[];renderSignature();save();};
for(const id of ['camera','another-camera'])$('#'+id).onclick=()=>$('#camera-file').click();
for(const id of ['upload','another-upload'])$('#'+id).onclick=()=>$('#receipt-file').click();
async function normaliseImage(file){
 if(file.size>20*1024*1024)throw Error('This photo is over 20 MB. Choose a smaller photo.');
 if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw Error('Choose a JPG, PNG or WebP photo. Convert HEIC photos to JPG first.');
 const url=URL.createObjectURL(file);try{const img=new Image();img.src=url;await img.decode();const scale=Math.min(1,5000/Math.max(img.width,img.height),2200/img.width),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(img.width*scale));canvas.height=Math.max(1,Math.round(img.height*scale));const ctx=canvas.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0,canvas.width,canvas.height);return canvas.toDataURL('image/jpeg',.9);}finally{URL.revokeObjectURL(url);}}
for(const selector of ['#receipt-file','#camera-file'])$(selector).onchange=async e=>{
 const files=Array.from(e.target.files);
 e.target.value='';
 if(!files.length||readingId||importingPhotos)return;
 importingPhotos=true;
 summary();
 const added=[];
 const failures=[];
 try{
  for(const file of files){
   try{
    const image=await normaliseImage(file);
    added.push({id:crypto.randomUUID(),image,date:'',amount:'',description:'',category:'',checked:false,reading:false,note:''});
   }catch(err){
    failures.push(err.message||'Could not open that photo. Try a JPG image.');
   }
  }
  if(!added.length)return;
  state.receipts.push(...added);
  render();
  save();
  $(`[data-id="${added[0].id}"]`)?.scrollIntoView({block:'nearest'});
  for(const [index,receipt] of added.entries()){
   if(!state.receipts.includes(receipt)||receipt.checked)continue;
   const label=added.length>1?`Photo ${index+1} of ${added.length}: `:'';
   await readReceipt(receipt,label);
  }
 }finally{
  importingPhotos=false;
  render();
  if(failures.length)notify(failures.length===1?failures[0]:`${failures.length} photos could not be added. ${failures[0]}`,true);
 }
};
async function readReceipt(r,label=''){
 if(readingId)return;const token=++readToken;readingId=r.id;r.reading=true;r.checked=false;const before={date:r.date,amount:r.amount};$('#reading').hidden=false;$('#reading-text').textContent=label+'Starting receipt reader…';$('#progress').value=0;render();save();let timeout;
 const cancelled=new Promise(resolve=>{cancelCurrentRead=()=>resolve(null);});
 try{
  const task=(async()=>{let currentWorker=worker;if(!currentWorker)currentWorker=await Tesseract.createWorker('eng',1,{workerPath:new URL('vendor/worker.min.js',location.href).href,corePath:new URL('vendor/core/',location.href).href,langPath:new URL('vendor/lang/',location.href).href,logger:m=>{if(token!==readToken)return;$('#reading-text').textContent=label+(m.status==='recognizing text'?`Reading receipt… ${Math.round(m.progress*100)}%`:'Loading receipt reader…');$('#progress').value=m.progress||0;}});if(token!==readToken){await currentWorker.terminate();throw Error('Cancelled');}worker=currentWorker;$('#reading-text').textContent=label+'Reading receipt…';return currentWorker.recognize(r.image);})();
  const result=await Promise.race([task,cancelled,new Promise((_,reject)=>{timeout=setTimeout(()=>reject(Error('timeout')),90000);})]);if(token!==readToken)return;
  const found=C.parseReceipt(result.data.text);for(const key of ['date','amount']){if(!before[key]&&r[key]===before[key]&&found[key])r[key]=found[key];}
  r.note=found.amount?'Suggested details only. Compare every field with the photo before checking.':'Couldn’t identify a clear total. Enter the amount from the receipt and check the other details.';
 }catch(e){if(token===readToken){r.note='Receipt reading didn’t finish. Enter the details manually or try reading again.';if(worker){worker.terminate().catch(()=>{});worker=null;}}}
 finally{clearTimeout(timeout);if(token===readToken){cancelCurrentRead=null;r.reading=false;readingId=null;$('#reading').hidden=true;render();save();}}
}
$('#stop-reading').onclick=()=>{const r=state.receipts.find(x=>x.id===readingId);++readToken;cancelCurrentRead?.();cancelCurrentRead=null;if(worker){worker.terminate().catch(()=>{});worker=null;}if(r){r.reading=false;r.checked=false;r.note='Enter the details from the photo, then check this item.';}readingId=null;$('#reading').hidden=true;render();save();};
$('#receipts').oninput=e=>{const key=e.target.dataset.field;if(!key)return;const r=state.receipts.find(x=>x.id===e.target.closest('[data-id]').dataset.id);C.editItem(r,key,e.target.value);updateCard(r);save();};
$('#receipts').onchange=e=>{if(e.target.dataset.action!=='check')return;const r=state.receipts.find(x=>x.id===e.target.closest('[data-id]').dataset.id);r.checked=e.target.checked&&C.validItem(r);
 expandedReceipts.delete(r.id);
 render();
 if(r.checked){
  const toggle=$(`[data-id="${r.id}"] .receipt-toggle`);
  toggle.focus({preventScroll:true});
  toggle.scrollIntoView({block:'nearest'});
 }
 save();};
$('#receipts').onclick=async e=>{const button=e.target.closest('button[data-action]');if(!button)return;const r=state.receipts.find(x=>x.id===button.closest('[data-id]').dataset.id),action=button.dataset.action;
 if(action==='vat'){C.editItem(r,'vatMode',button.dataset.vat);render();save();const selected=$(`[data-id="${r.id}"] [data-vat="${r.vatMode}"]`);selected?.focus({preventScroll:true});}
 if(action==='toggle'){
  if(expandedReceipts.has(r.id))expandedReceipts.delete(r.id);else expandedReceipts.add(r.id);
  render();$(`[data-id=${JSON.stringify(r.id)}] .receipt-toggle`).focus({preventScroll:true});
 }
 if(action==='view'){const index=state.receipts.indexOf(r)+1;$('#photo-title').textContent=`Receipt ${index} · ${r.amount?money(C.pence(r.amount)||0):'Check amount'}`;$('#large-photo').src=r.image;$('#photo-dialog').showModal();}
 if(action==='remove'&&confirm('Remove this receipt from the draft?')){expandedReceipts.delete(r.id);state.receipts=state.receipts.filter(x=>x!==r);render();save();}
 if(action==='read'&&!importingPhotos)await readReceipt(r);
 if(action==='rotate'){try{const image=new Image();image.src=r.image;await image.decode();const canvas=document.createElement('canvas');canvas.width=image.height;canvas.height=image.width;const ctx=canvas.getContext('2d');ctx.translate(canvas.width/2,canvas.height/2);ctx.rotate(Math.PI/2);ctx.drawImage(image,-image.width/2,-image.height/2);C.editItem(r,'image',canvas.toDataURL('image/jpeg',.92));r.note='Photo rotated. Check the details again.';render();save();}catch{notify('Could not rotate this photo.',true);}}
};
$('#close-photo').onclick=()=>$('#photo-dialog').close();
function download(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);}
$('#backup').onclick=()=>download(new Blob([JSON.stringify({format:'engineer-expenses',version:2,workspace})],{type:'application/json'}),'expenses-all-forms-backup-'+today()+'.json');
$('#restore').onclick=()=>$('#backup-file').click();
$('#backup-file').onchange=async e=>{
 const file=e.target.files[0];e.target.value='';if(!file||importingPhotos||readingId||pdfSaving)return;
 try{
  const data=JSON.parse(await file.text()),forms=ClaimForms.validateBackup(data);
  for(const form of forms)for(const receipt of form.receipts)if(receipt.kind!=='mileage'){const image=new Image();image.src=receipt.image;await image.decode();}
  const imports=forms.map(form=>{
   const copy=ClaimForms.normalise(form);
   if(workspace.forms.some(existing=>existing.id===copy.id||existing.reference===copy.reference)){const fresh=ClaimForms.create();copy.id=fresh.id;copy.reference=fresh.reference;}
   copy.receipts.forEach(r=>{r.id=crypto.randomUUID();r.checked=false;r.reading=false;r.note='Imported from backup. Check this expense again.';});
   return copy;
  });
  workspace.forms.push(...imports);workspace.activeFormId=imports[0].id;state=imports[0];
  showForm();save();notify('Backup imported as additional forms. Check each expense before downloading.');
 }catch(err){notify(err.message||'Could not import that backup.',true);}
};
function newFormDialog(){
 if(importingPhotos||readingId||pdfSaving)return;
 $('#new-form-type').value='personal';$('#form-dialog').showModal();
}
$('#add-form').onclick=newFormDialog;$('#new-claim').onclick=newFormDialog;
$('#close-form').onclick=()=>$('#form-dialog').close();
$('#new-form-fields').onsubmit=e=>{
 e.preventDefault();if(importingPhotos||readingId||pdfSaving)return;
 const form=ClaimForms.create({engineer:state.engineer,date:today(),paymentType:$('#new-form-type').value});
 workspace.forms.push(form);workspace.activeFormId=form.id;state=form;$('#form-dialog').close();showForm();save();
};
$('#form-select').onchange=e=>{
 if(importingPhotos||readingId||pdfSaving)return;
 const form=workspace.forms.find(f=>f.id===e.target.value);if(!form)return;
 state=form;workspace.activeFormId=form.id;showForm();save();
};
function mileageValue(r){if(!Object.hasOwn(C.mileageFuels,r.fuel)||!Object.hasOwn(C.mileageBands,r.engineBand))return 'Select fuel type and engine size, then check this journey again.';if(!C.validDate(r.date))return 'Enter a valid journey date.';if(r.date<C.mileageEffectiveDate)return 'Before 1 April 2026: payment to be calculated by accounts.';const rate=C.companyMileageRate(r),value=C.mileagePence(r.miles,rate);return (value===null?'Enter the distance':money(value))+' at '+Math.round(Number(rate)*100)+'p per mile';}
function vehicleOptions(choices,value){return '<option value="">Select an option</option>'+Object.entries(choices).map(([key,label])=>`<option value="${key}"${key===value?' selected':''}>${label}</option>`).join('');}
function updateMileagePayment(){ $('#mileage-payment').textContent=mileageValue({date:$('#mileage-date').value,miles:$('#mileage-miles').value,fuel:$('#mileage-fuel').value,engineBand:$('#mileage-engine-band').value}); }
for(const id of ['mileage-date','mileage-miles','mileage-fuel','mileage-engine-band'])$('#'+id).addEventListener('input',updateMileagePayment);
function mileageCard(r,i){
 const checked=r.checked&&C.validItem(r),collapsed=checked&&!expandedReceipts.has(r.id),details='receipt-details-'+r.id;
 return `<article class="receipt ${checked?'checked':''}" data-id="${r.id}">
 <div class="receipt-top" ${collapsed?'hidden':''}><h3>Expense ${i+1} · Personal vehicle mileage</h3><span class="badge">${checked?'Checked':'Needs checking'}</span></div>
 <button type="button" class="receipt-toggle" data-action="toggle" aria-controls="${details}" aria-expanded="${!collapsed}" ${checked?'':'hidden'}><span class="receipt-toggle-label">✓ Mileage</span><span>${dateText(r.date)}</span><strong>${escapeHtml(r.miles)} mi</strong><span>${collapsed?'▾':'▴'}</span></button>
 <div id="${details}" class="receipt-details" ${collapsed?'hidden':''}><div class="expense-fields">
 <label>Date<input type="date" data-field="date" value="${escapeHtml(r.date)}"></label>
 <label>Fuel type (required)<select data-field="fuel" required>${vehicleOptions(C.mileageFuels,r.fuel)}</select></label><label>Engine size (required)<select data-field="engineBand" required>${vehicleOptions(C.mileageBands,r.engineBand)}</select></label><label>Distance (miles)<input type="text" inputmode="decimal" data-field="miles" value="${escapeHtml(r.miles)}" maxlength="10"></label>
 <label class="description">Journey details / Notes (required)<input data-field="description" required maxlength="160" value="${escapeHtml(r.description)}"></label>
 </div><p class="mileage-value">${escapeHtml(mileageValue(r))}</p><p class="pack-note">Own personal vehicle used for this work journey.</p>
 <label class="check"><input type="checkbox" data-action="check" ${checked?'checked':''} ${C.validItem(r)?'':'disabled'}>I’ve checked the date, journey details and miles.</label>
 <button class="text-button remove" data-action="remove">Remove mileage</button></div></article>`;
}
$('#add-mileage').onclick=()=>{
 if(state.paymentType==='card'||importingPhotos||readingId||pdfSaving)return;
 $('#mileage-fuel').value=state.vehicleFuel||'';$('#mileage-engine-band').value=state.vehicleEngineBand||'';$('#mileage-date').value=today();$('#mileage-notes').value='';$('#mileage-miles').value='';$('#personal-vehicle').checked=false;$('#mileage-error').textContent='';updateMileagePayment();$('#mileage-dialog').showModal();
};
$('#close-mileage').onclick=()=>$('#mileage-dialog').close();
$('#mileage-fields').onsubmit=e=>{
 e.preventDefault();if(state.paymentType==='card')return;
 const r={id:crypto.randomUUID(),kind:'mileage',category:'Mileage',date:$('#mileage-date').value,description:$('#mileage-notes').value.trim(),miles:$('#mileage-miles').value.trim(),fuel:$('#mileage-fuel').value,engineBand:$('#mileage-engine-band').value,rate:'',personalVehicle:$('#personal-vehicle').checked,amount:'',checked:false,reading:false};
 r.rate=C.companyMileageRate(r);
 if(!C.validItem(r)){$('#mileage-error').textContent='Complete the date, fuel type, engine size, journey details, miles and personal vehicle confirmation.';return;}
 state.vehicleFuel=r.fuel;state.vehicleEngineBand=r.engineBand;state.receipts.push(r);$('#mileage-dialog').close();render();save();$('[data-id="'+r.id+'"]').scrollIntoView({block:'nearest'});
};
function dateText(s){return C.validDate(s)?s.split('-').reverse().join('/'):'Not entered';}
function ascii(s){return String(s).replace(/[\u2018\u2019]/g,"'").replace(/[\u2013\u2014]/g,'-').replace(/[^\x20-\x7e\u00a0-\u00ff]/g,'?');}
function buildPDF(claim,{preview=false}={}){return ClaimExport.receiptPDF(claim,{preview});}
$('#preview-claim').onclick=()=>{
 try{
  if(!state.receipts.length)throw Error('Add an expense to preview the form.');
  const view=window.open('about:blank','_blank');if(!view)throw Error('Allow pop-ups to preview the claim.');
  view.opener=null;view.document.open();view.document.write(ClaimExport.preview(structuredClone(state)));view.document.close();
 }catch(error){notify(error.message,true);}
};
function showSaveDialog(file,message=''){
 pendingPDF=file;$('#save-file-name').textContent=file.name;
 $('#save-instructions').textContent=PdfSave.shareable(file)?'Tap Save file, then choose Save to Files and select a folder.':'Tap Save file to download to your device.';
 $('#save-result').textContent=message;$('#save-dialog').showModal();
}
function saveResult(result){notify(result==='saved'?'File saved.':result==='device'?'Choose Save to Files in your device’s save options.':'Download requested. Check your Downloads folder.');}
async function saveExport(file,picker=null){
 try{saveResult(await PdfSave.save(file,{picker,download}));}
 catch(error){if(error.name==='AbortError'){notify('Saving cancelled.');return;}showSaveDialog(file,'Tap Save file to try again.');}
}
$('#close-save').onclick=()=>$('#save-dialog').close();
$('#save-dialog').onclose=()=>{pendingPDF=null;};
$('#save-file').onclick=async()=>{
 if(!pendingPDF)return;
 $('#save-file').disabled=true;
 try{await saveExport(pendingPDF);}finally{$('#save-file').disabled=false;}
};
async function exportClaim(kind){
 if(pdfSaving||readingId||importingPhotos)return;
 try{
  if(!C.canCreate(state))throw Error('Complete Expense Type and Notes, then check every expense before downloading.');
  const snapshot=structuredClone(state),extension=kind==='word'?'docx':'pdf',name=snapshot.reference+(kind==='word'?'-claim.':'-receipts.')+extension;
  pdfSaving=true;summary();
  let picker=null;
  if(typeof window.showSaveFilePicker==='function'){
   const mime=kind==='word'?'application/vnd.openxmlformats-officedocument.wordprocessingml.document':'application/pdf';
   try{picker=window.showSaveFilePicker({suggestedName:name,types:[{description:kind==='word'?'Word document':'Receipt PDF',accept:{[mime]:['.'+extension]}}]});await picker;}catch(error){if(error.name==='AbortError')return;picker=null;}
  }
  const blob=kind==='word'?await ClaimExport.word(snapshot):buildPDF(snapshot).output('blob');
  const file=new File([blob],name,{type:kind==='word'?'application/vnd.openxmlformats-officedocument.wordprocessingml.document':'application/pdf'});
  if(PdfSave.shareable(file)&&!picker)showSaveDialog(file);else await saveExport(file,picker);
 }catch(error){notify(error.message||'Could not create that file.',true);}
 finally{pdfSaving=false;summary();}
}
$('#create-claim').onclick=()=>exportClaim('word');
$('#download-receipts').onclick=()=>exportClaim('receipts');
init();
