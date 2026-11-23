/* Supabase trial integration. Uses a browser publishable key; access is enforced by database RLS. */
'use strict';
const cloudClient=supabase.createClient(TrialConfig.url,TrialConfig.publishableKey,{auth:{storageKey:'engineer-expenses-trial-auth',persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}});
let trialMember=null,trialUser=null,trialStarted=false,trialView='draft',cloudRows=[],activeCloudClaim=null;
const cloudMoney=n=>money(Number(n||0));
function cloudMessage(message,error=false){const node=$('#cloud-message');node.textContent=message;node.classList.toggle('error',error);}
function cloudResult(result){if(result.error)throw result.error;return result.data;}
function cloudStatus(row){return row.payment_type==='card'&&row.status==='paid'?'reconciled':row.status;}
function updateSubmit(){if($('#submit-cloud'))$('#submit-cloud').disabled=!trialMember||!C.canCreate(state)||pdfSaving||importingPhotos||!!readingId;}
window.TrialUI={updateSubmit};
function switchTrialView(view){trialView=view;$('#expense-main').hidden=view!=='draft';$('#cloud-main').hidden=view==='draft';$('#trial-draft').setAttribute('aria-current',view==='draft'?'page':'false');$('#trial-mine').setAttribute('aria-current',view==='mine'?'page':'false');$('#trial-finance').setAttribute('aria-current',view==='finance'?'page':'false');if(view!=='draft')loadCloudClaims();}
async function startTrial(user){
 if(trialStarted)return;
 trialUser=user;const memberResult=await cloudClient.from('expense_members').select('company_id,role,display_name,expense_companies(name)').eq('user_id',user.id).limit(1);
 trialMember=cloudResult(memberResult)?.[0];
 if(!trialMember){$('#trial-login-message').textContent='Your login works. Team access has not been assigned yet; tell Ian this account’s email so it can be enabled.';$('#trial-login').hidden=true;$('#trial-signout').hidden=false;return;}
 trialStarted=true;window.TrialUserId=user.id;
 $('#trial-auth-panel').hidden=true;$('#trial-session').hidden=false;$('#trial-user').textContent=(trialMember.display_name||user.email)+' · '+trialMember.role+' · '+(trialMember.expense_companies?.name||'Trial');
 $('#trial-finance').hidden=!['finance','admin'].includes(trialMember.role);$('#trial-signout').hidden=false;
 workspace=ClaimForms.load(null,{date:today(),engineer:trialMember.display_name||''});state=workspace.forms[0];await init();switchTrialView('draft');updateSubmit();
}
$('#trial-login').onsubmit=async event=>{
 event.preventDefault();$('#trial-login-button').disabled=true;$('#trial-login-message').textContent='Signing in...';
 try{const data=cloudResult(await cloudClient.auth.signInWithPassword({email:$('#trial-email').value.trim(),password:$('#trial-password').value}));$('#trial-password').value='';await startTrial(data.user);}catch(error){$('#trial-login-message').textContent=error.message||'Could not sign in.';}finally{$('#trial-login-button').disabled=false;}
};
$('#trial-signout').onclick=async()=>{await saving.catch(()=>{});const {error}=await cloudClient.auth.signOut();if(error){cloudMessage(error.message,true);return;}location.replace(new URL('trial/index.html',document.baseURI).href);};
$('#trial-draft').onclick=()=>switchTrialView('draft');$('#trial-mine').onclick=()=>switchTrialView('mine');$('#trial-finance').onclick=()=>switchTrialView('finance');$('#cloud-refresh').onclick=()=>loadCloudClaims();$('#cloud-status-filter').onchange=()=>loadCloudClaims();
async function snapshotHash(form){const clean=structuredClone(form);delete clean.cloudUpload;const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(clean)));return Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');}
async function submitToFinance(){
 if(!trialMember||!C.canCreate(state)||pdfSaving||readingId||importingPhotos)return;
 const form=state,snapshot=structuredClone(form);delete snapshot.cloudUpload;
 pdfSaving=true;summary();cloudMessage('Preparing checked claim...');
 try{
  const hash=await snapshotHash(snapshot);let upload=form.cloudUpload;
  if(upload?.hash===hash){const rows=cloudResult(await cloudClient.from('expense_claims').select('id,status').eq('id',upload.id).eq('owner_id',trialUser.id));if(rows[0]?.status==='submitted'||rows[0]?.status==='approved'||rows[0]?.status==='paid'){cloudMessage('This version has already been submitted.');switchTrialView('mine');return;}if(rows[0]?.status!=='draft')upload=null;}else upload=null;
  if(!upload){upload={id:crypto.randomUUID(),hash};form.cloudUpload=upload;save();await saving;}
  const payload=structuredClone(snapshot);payload.receipts=payload.receipts.map(item=>{if(item.kind==='mileage')return item;const copy={...item,imagePath:`${trialMember.company_id}/${trialUser.id}/${upload.id}/${item.id}.jpg`};delete copy.image;return copy;});
  const row={id:upload.id,company_id:trialMember.company_id,owner_id:trialUser.id,reference:snapshot.reference,payment_type:snapshot.paymentType,claim_date:snapshot.claimDate,engineer:snapshot.engineer,payload,status:'draft'};
  const existing=cloudResult(await cloudClient.from('expense_claims').select('id').eq('id',upload.id).eq('owner_id',trialUser.id));
  if(existing.length)cloudResult(await cloudClient.from('expense_claims').update({payload,engineer:row.engineer,payment_type:row.payment_type,claim_date:row.claim_date,status:'draft'}).eq('id',upload.id).eq('owner_id',trialUser.id));
  else cloudResult(await cloudClient.from('expense_claims').insert(row));
  const photos=snapshot.receipts.filter(r=>r.kind!=='mileage');
  for(const [index,item] of photos.entries()){
   cloudMessage(`Uploading receipt ${index+1} of ${photos.length}...`);const path=`${trialMember.company_id}/${trialUser.id}/${upload.id}/${item.id}.jpg`,blob=await (await fetch(item.image)).blob();
   const result=await cloudClient.storage.from('expense-receipts').upload(path,blob,{contentType:'image/jpeg',upsert:false});if(result.error&&String(result.error.statusCode)!=='409')throw result.error;
  }
  const submitted=cloudResult(await cloudClient.from('expense_claims').update({status:'submitted'}).eq('id',upload.id).eq('owner_id',trialUser.id).select('id,status'));
  if(!submitted.length)throw Error('The submission could not be confirmed. Refresh your submitted claims before retrying.');
  cloudMessage('Submitted to finance. This checked copy is now locked.');switchTrialView('mine');
 }catch(error){cloudMessage((error.message||'Upload did not finish.')+' Your local draft is safe; retry from Your claim.',true);}
 finally{pdfSaving=false;summary();}
}
$('#submit-cloud').onclick=()=>submitToFinance();
async function loadCloudClaims(){
 if(!trialMember)return;$('#cloud-title').textContent=trialView==='finance'?'Finance claims':'My submitted claims';$('#cloud-list').textContent='Loading claims...';$('#cloud-detail').hidden=true;activeCloudClaim=null;
 try{
  let query=cloudClient.from('expense_claims').select('id,reference,engineer,claim_date,payment_type,status,receipt_gross,mileage_amount,mileage_pending,total_pence,owed_pence,review_note,submitted_at,created_at').eq('company_id',trialMember.company_id).order('created_at',{ascending:false}).limit(200);
  if(trialView==='finance')query=query.neq('status','draft');else query=query.eq('owner_id',trialUser.id);
  const status=$('#cloud-status-filter').value;if(status)query=query.eq('status',status);
  cloudRows=cloudResult(await query);$('#cloud-list').innerHTML=cloudRows.length?'<div class="cloud-table-wrap"><table><thead><tr><th>Engineer / reference</th><th>Date</th><th>Type</th><th>Total</th><th>Owed</th><th>Status</th><th></th></tr></thead><tbody>'+cloudRows.map((row,index)=>`<tr><td>${escapeHtml(row.engineer)}<small>${escapeHtml(row.reference)}</small></td><td>${dateText(row.claim_date)}</td><td>${row.payment_type==='card'?'Company card':'Personal'}</td><td>${cloudMoney(row.total_pence)}${row.mileage_pending?' *':''}</td><td>${cloudMoney(row.owed_pence)}</td><td>${escapeHtml(cloudStatus(row))}</td><td><button data-cloud-open="${index}">Open</button></td></tr>`).join('')+'</tbody></table></div><p class="pack-note">* Mileage payment is pending accounts calculation. Showing the newest 200 matching claims.</p>':'No matching claims yet.';
 }catch(error){$('#cloud-list').textContent=error.message||'Could not load claims.';}
}
$('#cloud-list').onclick=event=>{const button=event.target.closest('[data-cloud-open]');if(button)openCloudClaim(cloudRows[Number(button.dataset.cloudOpen)]?.id);};
async function openCloudClaim(id){
 if(!id)return;cloudMessage('Opening submitted claim...');
 try{const row=cloudResult(await cloudClient.from('expense_claims').select('*').eq('id',id).eq('company_id',trialMember.company_id).single());activeCloudClaim=row;const t=row;
  $('#cloud-detail').hidden=false;$('#cloud-detail-title').textContent=row.reference+' · '+cloudStatus(row);$('#cloud-detail-summary').textContent=`${row.engineer} · ${dateText(row.claim_date)} · receipts ${cloudMoney(t.receipt_gross)} · mileage ${cloudMoney(t.mileage_amount)} · owed ${cloudMoney(t.owed_pence)}${row.mileage_pending?' (mileage payment pending)':''}`;
  $('#cloud-detail-lines').innerHTML='<div class="cloud-table-wrap"><table><thead><tr><th>Date</th><th>Type</th><th>Notes / journey</th><th>Amount / miles</th></tr></thead><tbody>'+row.payload.receipts.map(item=>`<tr><td>${dateText(item.date)}</td><td>${escapeHtml(item.category)}</td><td>${escapeHtml(item.description)}</td><td>${item.kind==='mileage'?escapeHtml(item.miles)+' miles':cloudMoney(C.pence(item.amount))}</td></tr>`).join('')+'</tbody></table></div>';
  $('#cloud-review-note').value=row.review_note||'';const finance=['finance','admin'].includes(trialMember.role);$('#cloud-approve').hidden=!finance||row.status!=='submitted';$('#cloud-return').hidden=!finance||row.status!=='submitted';$('#cloud-paid').hidden=!finance||row.status!=='approved';$('#cloud-paid').textContent=row.payment_type==='card'?'Mark reconciled':'Mark paid';$('#cloud-note-label').hidden=!finance;$('#cloud-preview').disabled=row.status==='draft';$('#cloud-word').disabled=row.status==='draft';$('#cloud-receipts').disabled=row.status==='draft'||!row.payload.receipts.some(r=>r.kind!=='mileage');
  const events=cloudResult(await cloudClient.from('expense_claim_events').select('status,note,created_at').eq('claim_id',id).order('created_at'));$('#cloud-events').textContent=events.map(e=>new Date(e.created_at).toLocaleString('en-GB')+' · '+e.status+(e.note?' · '+e.note:'')).join('\n');
  cloudMessage(row.status==='returned'?'Finance returned this claim. Correct your local draft, check the changes and submit it as a new version.':'');$('#cloud-detail').scrollIntoView({block:'start'});
 }catch(error){cloudMessage(error.message||'Could not open claim.',true);}
}
async function reviewCloudClaim(status){
 const row=activeCloudClaim;if(!row)return;const note=$('#cloud-review-note').value.trim();if(status==='returned'&&!note){cloudMessage('Enter a note explaining the correction needed.',true);return;}
 for(const id of ['cloud-approve','cloud-return','cloud-paid'])$('#'+id).disabled=true;
 try{const result=cloudResult(await cloudClient.from('expense_claims').update({status,review_note:note}).eq('id',row.id).eq('company_id',trialMember.company_id).eq('status',row.status).select('id'));if(!result.length)throw Error('Someone changed this claim. Refresh and try again.');await loadCloudClaims();await openCloudClaim(row.id);}catch(error){cloudMessage(error.message,true);}finally{for(const id of ['cloud-approve','cloud-return','cloud-paid'])$('#'+id).disabled=false;}
}
$('#cloud-approve').onclick=()=>reviewCloudClaim('approved');$('#cloud-return').onclick=()=>reviewCloudClaim('returned');$('#cloud-paid').onclick=()=>reviewCloudClaim('paid');
function blobDataURL(blob){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(Error('Could not read a receipt photo.'));reader.readAsDataURL(blob);});}
async function hydrateCloudClaim(row){const form=structuredClone(row.payload);for(const item of form.receipts){if(item.kind!=='mileage')item.image=await blobDataURL(cloudResult(await cloudClient.storage.from('expense-receipts').download(item.imagePath)));}return form;}
async function exportCloudClaim(kind){
 const row=activeCloudClaim;if(!row)return;const view=kind==='preview'?window.open('about:blank','_blank'):null;if(kind==='preview'&&!view){cloudMessage('Allow pop-ups to preview the claim.',true);return;}
 for(const id of ['cloud-preview','cloud-word','cloud-receipts'])$('#'+id).disabled=true;cloudMessage('Preparing submitted claim...');
 try{const form=await hydrateCloudClaim(row);if(kind==='preview'){view.opener=null;view.document.write(ClaimExport.preview(form));view.document.close();}else{const word=kind==='word',blob=word?await ClaimExport.word(form):ClaimExport.receiptPDF(form).output('blob'),file=new File([blob],form.reference+(word?'-claim.docx':'-receipts.pdf'),{type:word?'application/vnd.openxmlformats-officedocument.wordprocessingml.document':'application/pdf'});if(PdfSave.shareable(file))showSaveDialog(file);else await saveExport(file);}cloudMessage('');}catch(error){view?.close();cloudMessage(error.message||'Could not export the submitted claim.',true);}finally{$('#cloud-preview').disabled=false;$('#cloud-word').disabled=false;$('#cloud-receipts').disabled=!row.payload.receipts.some(r=>r.kind!=='mileage');}
}
$('#cloud-preview').onclick=()=>exportCloudClaim('preview');$('#cloud-word').onclick=()=>exportCloudClaim('word');$('#cloud-receipts').onclick=()=>exportCloudClaim('receipts');
(async()=>{try{const result=await cloudClient.auth.getUser();if(result.data?.user)await startTrial(result.data.user);}catch(error){$('#trial-login-message').textContent=error.message;}})();
