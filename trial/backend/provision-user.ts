import { createClient } from 'npm:@supabase/supabase-js@2.119.2';
const origin='https://thest3ward.github.io';
const headers={'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info','Access-Control-Allow-Methods':'POST, OPTIONS','Content-Type':'application/json','Cache-Control':'no-store'};
const reply=(status:number,body:object)=>new Response(JSON.stringify(body),{status,headers});
Deno.serve(async(req:Request)=>{
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
 if(req.method!=='POST')return reply(405,{error:'Use POST.'});
 if(req.headers.get('origin')&&req.headers.get('origin')!==origin)return reply(403,{error:'Origin not allowed.'});
 const token=(req.headers.get('authorization')||'').replace(/^Bearer\s+/i,'');
 if(!token)return reply(401,{error:'Sign in first.'});
 // This function explicitly verifies Auth before using its server-only admin key.
 const admin=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
 const auth=await admin.auth.getUser(token);if(auth.error||!auth.data.user)return reply(401,{error:'Sign in again.'});
 const membership=await admin.from('expense_members').select('company_id,role,password_change_required').eq('user_id',auth.data.user.id).eq('role','admin').eq('password_change_required',false).limit(1).maybeSingle();
 if(membership.error||!membership.data)return reply(403,{error:'Administrator access required.'});
 try{
  if(Number(req.headers.get('content-length')||0)>4096)return reply(413,{error:'Request too large.'});
  const body=await req.json(),email=String(body.email||'').trim().toLowerCase(),name=String(body.name||'').trim(),role=String(body.role||''),password=String(body.password||'');
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254||!name||name.length>80||!['engineer','manager','finance'].includes(role)||password.length<8||password.length>128)return reply(400,{error:'Enter a valid name, email, role and temporary password (8–128 characters).'});
  const created=await admin.auth.admin.createUser({email,password,email_confirm:true});
  if(created.error||!created.data.user)return reply(400,{error:created.error?.message||'Could not create login.'});
  const user=created.data.user;
  const added=await admin.from('expense_members').insert({company_id:membership.data.company_id,user_id:user.id,role,display_name:name,password_change_required:true});
  if(added.error){await admin.auth.admin.deleteUser(user.id);return reply(500,{error:'Could not assign team access. The new login was removed; please retry.'});}
  return reply(201,{email,role,name,password_change_required:true});
 }catch{return reply(400,{error:'Could not create account. Check the details and try again.'});}
});
