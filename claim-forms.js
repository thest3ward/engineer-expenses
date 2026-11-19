(function(root){
 'use strict';
 const C=root.ExpenseCore;
 function create({engineer='',date='',paymentType='personal',mileageRate=''}={},id=()=>crypto.randomUUID()){
  const uid=id();
  return {id:uid,reference:'EXP-'+uid.toUpperCase(),paymentType,engineer,claimDate:date,mileageRate,receipts:[],signature:[]};
 }
 function normalise(form,id=()=>crypto.randomUUID()){
  const result={...form};
  result.id||=id();result.reference||='EXP-'+result.id.toUpperCase();
  result.paymentType=form.paymentType==='card'?'card':'personal';
  result.mileageRate=typeof form.mileageRate==='string'?form.mileageRate:'';
  result.receipts=form.receipts.map(original=>{
   const r={...original,id:original.id||id(),category:original.kind==='mileage'?'Mileage':original.category||'',reading:false};
   if(original.reading)r.note='Reading was interrupted. Check the details or read the photo again.';
   r.checked=!!original.checked&&!original.reading&&C.validItem(r);
   return r;
  });
  return result;
 }
 function load(saved,defaults={},id=()=>crypto.randomUUID()){
  const forms=saved?.version===2?saved.forms.map(f=>normalise(f,id)):saved?.receipts?[normalise(saved,id)]:[create(defaults,id)];
  if(!forms.length)forms.push(create(defaults,id));
  const activeFormId=forms.some(f=>f.id===saved?.activeFormId)?saved.activeFormId:forms[0].id;
  return {version:2,activeFormId,forms};
 }
 function validateBackup(data){
  if(data?.format!=='engineer-expenses')throw Error('Choose an expenses backup exported from this app.');
  const forms=data.version===1?[data.claim]:data.version===2?data.workspace?.forms:null;
  if(!Array.isArray(forms)||!forms.length)throw Error('The backup contains no forms.');
  for(const f of forms){
   if(!f||typeof f.engineer!=='string'||f.engineer.length>80||typeof f.claimDate!=='string'||!Array.isArray(f.receipts))throw Error('Invalid form in backup.');
   if(f.paymentType!=null&&!['personal','card'].includes(f.paymentType))throw Error('Invalid payment type in backup.');
   if(f.mileageRate!=null&&(typeof f.mileageRate!=='string'||f.mileageRate!==''&&C.mileagePence('1',f.mileageRate)===null))throw Error('Invalid mileage rate in backup.');
   for(const r of f.receipts){
    if(r.vatMode!=null&&!['none','standard','custom'].includes(r.vatMode))throw Error('Invalid VAT choice in backup.');
    if(r.vatAmount!=null&&(typeof r.vatAmount!=='string'||r.vatAmount.length>10))throw Error('Invalid VAT amount in backup.');
    if(!r||typeof r.date!=='string'||typeof r.description!=='string'||r.description.length>160||typeof r.amount!=='string'||r.amount.length>10||r.date.length>10)throw Error('Invalid expense in backup.');
    if(r.kind==='mileage'){
     if(typeof r.miles!=='string'||typeof r.rate!=='string'||r.personalVehicle!==true||f.paymentType==='card')throw Error('Invalid personal vehicle mileage in backup.');
     if(!/^\d{1,7}(?:\.\d{1,2})?$/.test(r.miles)||Number(r.miles)<=0||r.rate!==''&&C.mileagePence(r.miles,r.rate)===null)throw Error('Invalid mileage distance or rate.');
    }else if(typeof r.image!=='string'||r.image.length>30*1024*1024||!/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(r.image))throw Error('Invalid receipt photo in backup.');
   }
   C.cleanSignature(f.signature);
  }
  return forms;
 }
 root.ClaimForms={create,normalise,load,validateBackup};
 if(typeof module!=='undefined')module.exports=root.ClaimForms;
})(typeof globalThis!=='undefined'?globalThis:this);
