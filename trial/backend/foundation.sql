-- Additive trial schema. No live app or existing drafts are migrated.
create schema if not exists expense_private;
revoke all on schema expense_private from public, anon;
grant usage on schema expense_private to authenticated;
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;

create table public.expense_companies (
 id uuid primary key default gen_random_uuid(),
 name text not null check(length(trim(name)) between 1 and 120),
 created_at timestamptz not null default now()
);
create table public.expense_members (
 company_id uuid not null references public.expense_companies(id),
 user_id uuid not null references auth.users(id),
 role text not null check(role in ('engineer','finance','admin')),
 display_name text not null check(length(trim(display_name)) between 1 and 80),
 created_at timestamptz not null default now(),
 primary key(company_id,user_id)
);
create index expense_members_user_idx on public.expense_members(user_id,company_id);
alter table public.expense_companies enable row level security;
alter table public.expense_members enable row level security;

create function expense_private.member_role(company uuid) returns text
language sql stable security definer set search_path='' as $$
 select m.role from public.expense_members m
 where auth.uid() is not null and m.company_id=company and m.user_id=auth.uid()
$$;
revoke all on function expense_private.member_role(uuid) from public,anon;
grant execute on function expense_private.member_role(uuid) to authenticated;

create policy expense_company_read on public.expense_companies for select to authenticated
 using(expense_private.member_role(id) is not null);
create policy expense_member_read on public.expense_members for select to authenticated
 using(user_id=(select auth.uid()) or expense_private.member_role(company_id) in ('admin','finance'));
revoke all on public.expense_companies,public.expense_members from anon,authenticated;
grant select on public.expense_companies,public.expense_members to authenticated;

create table public.expense_claims (
 id uuid primary key,
 company_id uuid not null references public.expense_companies(id),
 owner_id uuid not null references auth.users(id),
 reference text not null check(length(reference) between 1 and 90),
 payment_type text not null check(payment_type in ('personal','card')),
 claim_date date not null,
 engineer text not null,
 status text not null default 'draft' check(status in ('draft','submitted','returned','approved','paid')),
 payload jsonb not null check(jsonb_typeof(payload)='object' and pg_column_size(payload)<2097152),
 receipt_net bigint not null default 0,
 receipt_vat bigint not null default 0,
 receipt_gross bigint not null default 0,
 mileage_amount bigint not null default 0,
 mileage_miles numeric(12,2) not null default 0,
 mileage_pending boolean not null default false,
 total_pence bigint not null default 0,
 owed_pence bigint not null default 0,
 review_note text not null default '' check(length(review_note)<=1000),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 submitted_at timestamptz,
 reviewed_at timestamptz,
 reviewed_by uuid references auth.users(id),
 paid_at timestamptz,
 foreign key(company_id,owner_id) references public.expense_members(company_id,user_id)
);
create index expense_claims_owner_idx on public.expense_claims(owner_id,created_at desc);
create index expense_claims_company_status_idx on public.expense_claims(company_id,status,created_at desc);
create index expense_claims_reviewed_by_idx on public.expense_claims(reviewed_by);
alter table public.expense_claims enable row level security;
create policy expense_claim_read on public.expense_claims for select to authenticated using(
 expense_private.member_role(company_id) is not null and
 (owner_id=(select auth.uid()) or (status<>'draft' and expense_private.member_role(company_id) in ('admin','finance')))
);
create policy expense_claim_insert on public.expense_claims for insert to authenticated with check(
 owner_id=(select auth.uid()) and expense_private.member_role(company_id) is not null and status='draft'
);
create policy expense_claim_update on public.expense_claims for update to authenticated using(
 expense_private.member_role(company_id) is not null and
 (owner_id=(select auth.uid()) or (status<>'draft' and expense_private.member_role(company_id) in ('admin','finance')))
) with check(
 expense_private.member_role(company_id) is not null and
 (owner_id=(select auth.uid()) or (status<>'draft' and expense_private.member_role(company_id) in ('admin','finance')))
);
revoke all on public.expense_claims from anon,authenticated;
grant select,insert,update on public.expense_claims to authenticated;

create function expense_private.valid_date(value text) returns boolean language plpgsql immutable set search_path='' as $$
begin
 if value is null or value !~ '^\d{4}-\d{2}-\d{2}$' then return false;end if;
 return value::date between date '2000-01-01' and date '2100-12-31' and to_char(value::date,'YYYY-MM-DD')=value;
exception when others then return false;
end $$;
create function expense_private.claim_totals(p jsonb, company uuid, owner_uuid uuid, claim_uuid uuid, require_files boolean)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare r jsonb;stroke jsonb;point jsonb;g bigint;v bigint;net bigint:=0;vat bigint:=0;gross bigint:=0;mp bigint:=0;
 miles numeric:=0;pending boolean:=false;rate text;payment text;photo_path text;points int:=0;ids text[]:='{}';
begin
 payment:=p->>'paymentType';
 if coalesce(payment,'') not in ('personal','card') or not expense_private.valid_date(p->>'claimDate')
 or length(trim(coalesce(p->>'engineer',''))) not between 1 and 80
 or coalesce(jsonb_typeof(p->'receipts'),'')<>'array' then raise exception 'Complete the engineer, date and claim type.';end if;
 if jsonb_array_length(p->'receipts') not between 1 and 300 then raise exception 'A claim needs between 1 and 300 expenses.';end if;
 for r in select value from jsonb_array_elements(p->'receipts') loop
  if coalesce(r->>'id','') !~ '^[0-9a-fA-F-]{36}$' or r->>'id'=any(ids) then raise exception 'Invalid or repeated expense ID.';end if;
  ids:=array_append(ids,r->>'id');
  if r->'checked' is distinct from 'true'::jsonb or not expense_private.valid_date(r->>'date')
   or length(trim(coalesce(r->>'description',''))) not between 1 and 160 then raise exception 'Every expense needs valid checked details.';end if;
  if r->>'kind'='mileage' then
   if payment='card' or r->'personalVehicle' is distinct from 'true'::jsonb
    or coalesce(r->>'fuel','') not in ('petrol','diesel') or coalesce(r->>'engineBand','') not in ('small','medium','large')
    or coalesce(r->>'miles','') !~ '^\d{1,7}(\.\d{1,2})?$' or (r->>'miles')::numeric<=0 then raise exception 'Invalid personal vehicle mileage.';end if;
   if (r->>'date')::date<date '2026-04-01' then rate:='';pending:=true;
   elsif r->>'engineBand'='small' then rate:='0.27';
   elsif r->>'fuel'='petrol' then rate:=case r->>'engineBand' when 'medium' then '0.31' else '0.35' end;
   else rate:=case r->>'engineBand' when 'medium' then '0.30' else '0.33' end;end if;
   if r->>'rate' is distinct from rate then raise exception 'Mileage rate does not match the company schedule.';end if;
   miles:=miles+(r->>'miles')::numeric;
   if rate<>'' then mp:=mp+round((r->>'miles')::numeric*rate::numeric*100)::bigint;end if;
  else
   if coalesce(r->>'category','') not in ('Food','Food - 12 hour shift','Food - staying away breakfast','Food - staying away lunch','Food - staying away dinner','Tools','Parking','Consumables','Other')
    or coalesce(r->>'amount','') !~ '^\d{1,7}(\.\d{1,2})?$' then raise exception 'Invalid receipt type or total.';end if;
   g:=round((r->>'amount')::numeric*100)::bigint;if g<=0 then raise exception 'Receipt amount must be positive.';end if;
   case r->>'vatMode'
    when 'none' then v:=0;
    when 'standard' then v:=round(g::numeric/6)::bigint;
    when 'custom' then
     if coalesce(r->>'vatAmount','') !~ '^\d{1,7}(\.\d{1,2})?$' then raise exception 'Enter a valid custom VAT amount.';end if;
     v:=round((r->>'vatAmount')::numeric*100)::bigint;
    else raise exception 'Select VAT for every receipt.';
   end case;
   if v<0 or v>g then raise exception 'VAT exceeds the receipt total.';end if;
   photo_path:=company::text||'/'||owner_uuid::text||'/'||claim_uuid::text||'/'||(r->>'id')||'.jpg';
   if r->>'imagePath' is distinct from photo_path or r ? 'image' then raise exception 'Invalid receipt photo path.';end if;
   if require_files and not exists(select 1 from storage.objects o where o.bucket_id='expense-receipts' and o.name=photo_path) then raise exception 'A receipt photo has not finished uploading.';end if;
   net:=net+g-v;vat:=vat+v;gross:=gross+g;
  end if;
 end loop;
 if p ? 'signature' then
  if jsonb_typeof(p->'signature')<>'array' or jsonb_array_length(p->'signature')>100 then raise exception 'Invalid signature.';end if;
  for stroke in select value from jsonb_array_elements(p->'signature') loop
   if jsonb_typeof(stroke)<>'array' or jsonb_array_length(stroke)<1 then raise exception 'Invalid signature stroke.';end if;
   points:=points+jsonb_array_length(stroke);if points>20000 then raise exception 'Signature is too large.';end if;
   for point in select value from jsonb_array_elements(stroke) loop
    if coalesce(jsonb_typeof(point->'x'),'')<>'number' or coalesce(jsonb_typeof(point->'y'),'')<>'number'
     or (point->>'x')::numeric not between 0 and 1 or (point->>'y')::numeric not between 0 and 1 then raise exception 'Invalid signature coordinates.';end if;
   end loop;
  end loop;
 end if;
 return jsonb_build_object('net',net,'vat',vat,'gross',gross,'mileage',mp,'miles',miles,'pending',pending,'total',gross+mp,'owed',case when payment='card' then 0 else gross+mp end);
end $$;
revoke all on function expense_private.valid_date(text),expense_private.claim_totals(jsonb,uuid,uuid,uuid,boolean) from public,anon;
grant execute on function expense_private.valid_date(text),expense_private.claim_totals(jsonb,uuid,uuid,uuid,boolean) to authenticated;

create function expense_private.guard_claim() returns trigger language plpgsql security invoker set search_path='' as $$
declare t jsonb;actor uuid:=auth.uid();member text;
begin
 if actor is null then raise exception 'Sign in first.';end if;
 member:=expense_private.member_role(new.company_id);if member is null then raise exception 'No company access.';end if;
 if tg_op='INSERT' then
  if new.owner_id<>actor or new.status<>'draft' then raise exception 'New claims must be your own drafts.';end if;
  new.created_at:=now();new.submitted_at:=null;new.reviewed_at:=null;new.reviewed_by:=null;new.paid_at:=null;new.review_note:='';
 else
  if (new.id,new.company_id,new.owner_id,new.reference,new.created_at) is distinct from (old.id,old.company_id,old.owner_id,old.reference,old.created_at) then raise exception 'Claim identity cannot change.';end if;
  if new.payload is distinct from old.payload and not(old.status='draft' and actor=old.owner_id) then raise exception 'Submitted claims are immutable. Correct and resubmit a new version.';end if;
  new.submitted_at:=old.submitted_at;new.reviewed_at:=old.reviewed_at;new.reviewed_by:=old.reviewed_by;new.paid_at:=old.paid_at;
  if old.status='draft' and actor=old.owner_id and new.status in ('draft','submitted') then
   new.review_note:='';if new.status='submitted' then new.submitted_at:=now();end if;
  elsif member in ('admin','finance') and ((old.status='submitted' and new.status in ('approved','returned')) or(old.status='approved' and new.status='paid')) then
   if new.status='returned' and length(trim(new.review_note))=0 then raise exception 'Explain why the claim is being returned.';end if;
   new.reviewed_at:=now();new.reviewed_by:=actor;if new.status='paid' then new.paid_at:=now();end if;
  else raise exception 'That claim status change is not allowed.';end if;
 end if;
 if new.reference is distinct from new.payload->>'reference' or new.payment_type is distinct from new.payload->>'paymentType'
  or new.engineer is distinct from new.payload->>'engineer' or new.claim_date::text is distinct from new.payload->>'claimDate' then raise exception 'Claim fields do not match its details.';end if;
 t:=expense_private.claim_totals(new.payload,new.company_id,new.owner_id,new.id,new.status<>'draft');
 new.receipt_net:=(t->>'net')::bigint;new.receipt_vat:=(t->>'vat')::bigint;new.receipt_gross:=(t->>'gross')::bigint;
 new.mileage_amount:=(t->>'mileage')::bigint;new.mileage_miles:=(t->>'miles')::numeric;new.mileage_pending:=(t->>'pending')::boolean;
 new.total_pence:=(t->>'total')::bigint;new.owed_pence:=(t->>'owed')::bigint;new.updated_at:=now();return new;
end $$;
revoke all on function expense_private.guard_claim() from public,anon;
create trigger expense_guard before insert or update on public.expense_claims for each row execute function expense_private.guard_claim();

create table public.expense_claim_events (
 id uuid primary key default gen_random_uuid(),
 claim_id uuid not null references public.expense_claims(id),
 actor_id uuid not null references auth.users(id),
 status text not null,
 note text not null default '',
 created_at timestamptz not null default now()
);
create index expense_claim_events_claim_idx on public.expense_claim_events(claim_id,created_at);
create index expense_claim_events_actor_idx on public.expense_claim_events(actor_id);
alter table public.expense_claim_events enable row level security;
create policy expense_events_read on public.expense_claim_events for select to authenticated using(exists(select 1 from public.expense_claims c where c.id=claim_id));
revoke all on public.expense_claim_events from anon,authenticated;
grant select on public.expense_claim_events to authenticated;
create function expense_private.audit_claim() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Sign in first.';end if;
 if tg_op='INSERT' or new.status is distinct from old.status then
  insert into public.expense_claim_events(claim_id,actor_id,status,note) values(new.id,auth.uid(),new.status,new.review_note);
 end if;return new;
end $$;
revoke all on function expense_private.audit_claim() from public,anon,authenticated;
create trigger expense_audit after insert or update on public.expense_claims for each row execute function expense_private.audit_claim();

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('expense-receipts','expense-receipts',false,20971520,array['image/jpeg']);
create policy expense_photo_read on storage.objects for select to authenticated using(
 bucket_id='expense-receipts' and exists(select 1 from public.expense_claims c
 where (storage.foldername(name))[1]=c.company_id::text and (storage.foldername(name))[2]=c.owner_id::text and (storage.foldername(name))[3]=c.id::text)
);
create policy expense_photo_insert on storage.objects for insert to authenticated with check(
 bucket_id='expense-receipts' and exists(select 1 from public.expense_claims c where c.owner_id=(select auth.uid()) and c.status='draft'
 and (storage.foldername(name))[1]=c.company_id::text and (storage.foldername(name))[2]=c.owner_id::text and (storage.foldername(name))[3]=c.id::text)
);
create policy expense_photo_delete on storage.objects for delete to authenticated using(
 bucket_id='expense-receipts' and exists(select 1 from public.expense_claims c where c.owner_id=(select auth.uid()) and c.status='draft'
 and (storage.foldername(name))[1]=c.company_id::text and (storage.foldername(name))[2]=c.owner_id::text and (storage.foldername(name))[3]=c.id::text)
);
-- Company/team membership is provisioned by the project owner, never self-assigned.
insert into public.expense_companies(name) values('Halton trial');
