/* Desktop receipt review. Private photographs remain authenticated Storage downloads. */
(function(root){
 'use strict';
 const stages={manager:'Manager',senior_manager:'Senior management',finance:'Accounts'};
 let current=null,serial=0;
 function ownMark(ctx,item){return ctx.marks.find(mark=>mark.item_id===item.id&&mark.stage===ctx.stage&&mark.reviewer_id===ctx.actor);}
 function isChecked(ctx,item){return ownMark(ctx,item)?.state==='checked';}
 function checkedCount(ctx){return ctx.row.payload.receipts.filter(item=>isChecked(ctx,item)).length;}
 function canApprove(){return !!current&&current.loaded&&current.editable&&!current.busy&&current.row.id===activeCloudClaim?.id&&current.view===trialView&&checkedCount(current)===current.row.payload.receipts.length;}
 function isBusy(){return !!current?.busy;}
 function issueSummary(){if(!current)return '';const notes=current.row.payload.receipts.map((item,index)=>{const mark=ownMark(current,item);return mark?.state==='flagged'?`Item ${index+1} (${item.category}): ${mark.note}`:'';}).filter(Boolean),text=notes.length?'Receipt issues:\n'+notes.join('\n'):'';return text.length>1000?'See the flagged items in this claim for the required corrections.':text;}
 function close(){
  serial++;if(current)for(const entry of current.photos.values())URL.revokeObjectURL(entry.url);current=null;
  $('#review-desk').hidden=true;$('#review-photo').removeAttribute('src');$('#review-photo').onload=null;$('#review-photo').onerror=null;
 }
 async function open(row,events=[]){
  close();const actions=approvalActions(row,trialMember.role,trialView),stage=trialView==='finance'?'finance':trialView==='senior'?'senior_manager':trialView==='manager'?'manager':(['approved','paid'].includes(row.status)||row.status==='returned'&&row.reviewed_by)?'finance':row.first_review_role;
  const editable=!!(actions.manage||actions.senior||actions.accounts);
  const approvalStatus={manager:'manager_approved',senior_manager:'senior_approved',finance:'approved'}[stage],event=events.filter(e=>e.status===approvalStatus).slice(-1)[0],returned=events.filter(e=>e.status==='returned').slice(-1)[0];
  const returningStage=row.reviewed_by?'finance':row.first_review_role;
  const reviewer=editable?trialUser.id:row.status==='returned'&&stage===returningStage&&returned?returned.actor_id:event?.actor_id||(stage==='finance'?row.reviewed_by:stage==='senior_manager'?row.senior_approved_by:row.manager_approved_by);
  const ctx={row,stage,actor:reviewer||trialUser.id,view:trialView,editable,index:0,marks:[],loaded:false,busy:false,photoReady:false,photos:new Map(),zoom:1,rotation:0,photoToken:0};current=ctx;
  $('#review-desk').hidden=false;$('#review-desk-message').textContent='Loading saved review checks...';render(ctx);select(0);
  try{ctx.marks=cloudResult(await cloudClient.from('expense_item_reviews').select('item_id,stage,reviewer_id,reviewer_name,state,note,updated_at').eq('claim_id',row.id).order('updated_at'));if(current!==ctx)return;ctx.loaded=true;$('#review-desk-message').textContent='';render(ctx);}
  catch(error){if(current===ctx){$('#review-desk-message').textContent='Could not load saved checks. Refresh this claim before approving. '+(error.message||'');render(ctx);}}
 }
 function render(ctx){
  if(current!==ctx)return;const items=ctx.row.payload.receipts,item=items[ctx.index],mark=ownMark(ctx,item),done=checkedCount(ctx);
  $('#review-stage-label').textContent=(stages[ctx.stage]||'Reviewer')+(ctx.editable?' · your checks':' · read-only');
  $('#review-progress').textContent=ctx.loaded?`${done} of ${items.length} checked${ctx.editable?' by you':''}`:'Loading review checks...';$('#review-progress-bar').max=items.length;$('#review-progress-bar').value=done;
  $('#review-items').innerHTML=items.map((entry,index)=>{const saved=ownMark(ctx,entry),state=saved?.state==='checked'?'Checked':saved?.state==='flagged'?'Flagged':'To check';return `<button type="button" data-review-item="${index}" class="review-item ${state==='Checked'?'is-checked':state==='Flagged'?'is-flagged':''}" aria-current="${index===ctx.index?'true':'false'}"${ctx.busy?' disabled':''}><span>${index+1}. ${escapeHtml(entry.category)}</span><small>${entry.kind==='mileage'?escapeHtml(entry.miles)+' miles':cloudMoney(C.pence(entry.amount))} · ${state}</small></button>`;}).join('');
  $('#review-own-mark').textContent=mark?`${mark.state==='checked'?'Checked':'Flagged'} by ${mark.reviewer_name} · ${new Date(mark.updated_at).toLocaleString('en-GB')}${mark.note?' — '+mark.note:''}`:ctx.editable?'Compare the receipt with these claimed details, then mark it checked.':'No item check recorded for this reviewer.';
  $('#review-own-mark').className='review-own-mark '+(mark?.state||'pending');
  $('#review-check-next').hidden=!ctx.editable;$('#review-check-next').disabled=ctx.busy||!ctx.loaded||!ctx.photoReady;$('#review-check-next').textContent=ctx.index===items.length-1?'Mark checked ✓':'Checked & next →';
  $('#review-flag').hidden=!ctx.editable;$('#review-flag').disabled=ctx.busy||!ctx.loaded;$('#review-clear').hidden=!ctx.editable||!mark;$('#review-clear').disabled=ctx.busy;
  $('#review-save-flag').disabled=ctx.busy;$('#review-cancel-flag').disabled=ctx.busy;
  $('#review-previous').disabled=ctx.busy||ctx.index===0;$('#review-next').disabled=ctx.busy||ctx.index===items.length-1;
  const history=ctx.marks.filter(record=>record.item_id===item.id);
  $('#review-history').innerHTML='<h4>Recorded item checks</h4><p>Engineer: checked as submitted.</p>'+history.map(record=>`<p><strong>${escapeHtml(stages[record.stage]||record.stage)}: ${record.state==='checked'?'Checked':'Flagged'}</strong><br>${escapeHtml(record.reviewer_name)} · ${escapeHtml(new Date(record.updated_at).toLocaleString('en-GB'))}${record.note?'<br>'+escapeHtml(record.note):''}</p>`).join('');
  $('#review-approval-help').textContent=ctx.editable?(done===items.length&&ctx.loaded?'Every item checked by you. You can approve this claim below.':'Your checks save as you go. Check every item before approving, or flag an issue and return the claim below.'):'This claim is read-only at this stage. Saved checks are shown where available; earlier approvals may predate item checks.';
  root.updateCloudReviewGate?.();
 }
 function details(ctx){
  const item=ctx.row.payload.receipts[ctx.index],mileage=item.kind==='mileage';let facts;
  $('#review-item-label').textContent=`Expense ${ctx.index+1} of ${ctx.row.payload.receipts.length}`;$('#review-item-type').textContent=item.category;
  if(mileage){const amount=C.mileagePence(item.miles,item.rate);$('#review-amount').textContent=amount===null?'Payment pending':cloudMoney(amount);facts=[['Date',dateText(item.date)],['Journey / notes',item.description],['Distance',item.miles+' miles'],['Vehicle','Personal vehicle'],['Fuel',item.fuel==='diesel'?'Diesel':'Petrol'],['Engine size',C.mileageBands[item.engineBand]||item.engineBand],['Rate',item.rate?String(Number(item.rate)*100)+'p per mile':'Accounts to calculate'],['VAT','Not applicable to mileage']];}
  else{const vat=C.vatBreakdown(item);$('#review-amount').textContent=cloudMoney(C.pence(item.amount));facts=[['Claimed including VAT',cloudMoney(vat?.gross)],['Ex VAT',cloudMoney(vat?.net)],['VAT',cloudMoney(vat?.vat)],['VAT selection',({none:'No VAT',standard:'20% VAT shown',custom:'Custom VAT'})[item.vatMode]||'Not selected'],['Receipt date',dateText(item.date)],['Expense type',item.category],['Label / notes',item.description]];}
  $('#review-details').innerHTML=facts.map(([label,value])=>'<div><dt>'+escapeHtml(label)+'</dt><dd>'+escapeHtml(value)+'</dd></div>').join('');
 }
 async function select(index){
  const ctx=current;if(!ctx||ctx.busy||index<0||index>=ctx.row.payload.receipts.length)return;
  ctx.index=index;ctx.zoom=1;ctx.rotation=0;ctx.photoReady=false;const token=++ctx.photoToken,item=ctx.row.payload.receipts[index];
  $('#review-flag-panel').hidden=true;$('#review-image-sheet').hidden=true;$('#review-photo-retry').hidden=true;$('#review-photo-message').hidden=false;$('#review-photo').removeAttribute('src');details(ctx);render(ctx);
  for(const id of ['review-zoom-in','review-zoom-out','review-fit','review-rotate'])$('#'+id).disabled=true;$('#review-zoom-label').textContent='Fit';
  if(item.kind==='mileage'){$('#review-photo-message').textContent='Mileage journey — check the distance and journey details alongside. There is no receipt photograph for this item.';ctx.photoReady=true;render(ctx);return;}
  $('#review-photo-message').textContent='Loading private receipt photo...';
  try{
   let entry=ctx.photos.get(item.id);
   if(!entry){const blob=cloudResult(await cloudClient.storage.from('expense-receipts').download(item.imagePath));if(current!==ctx||ctx.photoToken!==token)return;entry={url:URL.createObjectURL(blob)};ctx.photos.set(item.id,entry);while(ctx.photos.size>3){const first=ctx.photos.keys().next().value;URL.revokeObjectURL(ctx.photos.get(first).url);ctx.photos.delete(first);}}
   if(current!==ctx||ctx.photoToken!==token)return;
   const img=$('#review-photo');img.onload=()=>{if(current!==ctx||ctx.photoToken!==token||img.src!==entry.url||!img.complete||!img.naturalWidth)return;ctx.photoReady=true;$('#review-photo-message').hidden=true;$('#review-image-sheet').hidden=false;geometry(ctx);render(ctx);};
   img.onerror=()=>{if(current!==ctx||ctx.photoToken!==token||img.src!==entry.url||!img.complete||img.naturalWidth)return;photoError(ctx,'The receipt photo could not be displayed. Retry it, or flag it for correction.');};img.alt=`Receipt ${index+1}: ${item.category}, claimed ${cloudMoney(C.pence(item.amount))}`;img.src=entry.url;
  }catch(error){if(current===ctx&&ctx.photoToken===token)photoError(ctx,'Could not load this receipt. Retry it, or flag it for correction. '+(error.message||''));}
 }
 function photoError(ctx,message){ctx.photoReady=false;$('#review-photo-message').hidden=false;$('#review-photo-message').textContent=message;$('#review-image-sheet').hidden=true;$('#review-photo-retry').hidden=false;render(ctx);}
 function geometry(ctx){
  if(current!==ctx||!ctx.photoReady)return;const img=$('#review-photo');if(!img.naturalWidth)return;
  const box=$('#review-photo-viewport'),turned=ctx.rotation%180!==0,w=img.naturalWidth,h=img.naturalHeight,fit=Math.min(Math.max(100,box.clientWidth-32)/(turned?h:w),Math.max(160,box.clientHeight-32)/(turned?w:h));
  const width=w*fit*ctx.zoom,height=h*fit*ctx.zoom,sheet=$('#review-image-sheet');sheet.style.width=(turned?height:width)+'px';sheet.style.height=(turned?width:height)+'px';img.style.width=width+'px';img.style.height=height+'px';img.style.transform=`translate(-50%,-50%) rotate(${ctx.rotation}deg)`;
  $('#review-zoom-label').textContent=ctx.zoom===1?'Fit':Math.round(ctx.zoom*100)+'%';$('#review-zoom-out').disabled=ctx.zoom<=1;$('#review-zoom-in').disabled=ctx.zoom>=4;$('#review-fit').disabled=false;$('#review-rotate').disabled=false;
 }
 async function save(state,note='',advance=false){
  const ctx=current;if(!ctx?.editable||ctx.busy||!ctx.loaded||state==='checked'&&!ctx.photoReady)return;
  const item=ctx.row.payload.receipts[ctx.index];if(state==='flagged'&&!note.trim()){$('#review-desk-message').textContent='Enter a reason for this issue.';$('#review-issue-note').focus();return;}
  ctx.busy=true;$('#review-desk-message').textContent='Saving your review...';render(ctx);
  try{const saved=cloudResult(await cloudClient.rpc('expense_save_item_review',{claim_id_arg:ctx.row.id,item_id_arg:item.id,stage_arg:ctx.stage,state_arg:state,note_arg:note.trim()}));if(current!==ctx)return;
   ctx.marks=ctx.marks.filter(mark=>!(mark.item_id===item.id&&mark.stage===ctx.stage&&mark.reviewer_id===ctx.actor));if(state!=='pending'){if(!saved?.length)throw Error('The saved check could not be confirmed. Refresh the claim.');ctx.marks.push(saved[0]);}
   $('#review-desk-message').textContent=state==='flagged'?'Issue saved. Use Return for correction below when you are ready.':state==='pending'?'Your check was cleared.':'Your item check was saved.';$('#review-flag-panel').hidden=true;
   if(state==='flagged'){const noteField=$('#cloud-review-note');if(!noteField.value.trim()||noteField.value.startsWith('Receipt issues:'))noteField.value=issueSummary();}
   ctx.busy=false;render(ctx);if(advance&&ctx.index<ctx.row.payload.receipts.length-1)select(ctx.index+1);
  }catch(error){if(current===ctx){$('#review-desk-message').textContent=(error.message||'Could not save your check.')+' Your progress has not advanced.';ctx.busy=false;render(ctx);}}
 }
 $('#review-items').onclick=event=>{const button=event.target.closest('[data-review-item]');if(button)select(Number(button.dataset.reviewItem));};
 $('#review-previous').onclick=()=>select((current?.index||0)-1);$('#review-next').onclick=()=>select((current?.index||0)+1);
 $('#review-check-next').onclick=()=>save('checked','',true);$('#review-clear').onclick=()=>save('pending');
 $('#review-flag').onclick=()=>{if(!current?.editable||current.busy)return;$('#review-flag-panel').hidden=false;$('#review-issue-note').value=ownMark(current,current.row.payload.receipts[current.index])?.note||'';$('#review-issue-note').focus();};
 $('#review-save-flag').onclick=()=>save('flagged',$('#review-issue-note').value);$('#review-cancel-flag').onclick=()=>{$('#review-flag-panel').hidden=true;};
 $('#review-zoom-in').onclick=()=>{if(current){current.zoom=Math.min(4,current.zoom+.5);geometry(current);}};$('#review-zoom-out').onclick=()=>{if(current){current.zoom=Math.max(1,current.zoom-.5);geometry(current);}};
 $('#review-fit').onclick=()=>{if(current){current.zoom=1;geometry(current);}};$('#review-rotate').onclick=()=>{if(current){current.rotation=(current.rotation+90)%360;geometry(current);}};
 $('#review-photo-retry').onclick=()=>{if(!current)return;const item=current.row.payload.receipts[current.index],entry=current.photos.get(item.id);if(entry){URL.revokeObjectURL(entry.url);current.photos.delete(item.id);}select(current.index);};
 root.addEventListener?.('resize',()=>{if(current)geometry(current);});
 root.ReviewDesk={open,close,canApprove,isBusy,issueSummary};
})(window);

