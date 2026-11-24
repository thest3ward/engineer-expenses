create table public.expense_item_reviews (
 claim_id uuid not null references public.expense_claims(id),
 item_id text not null check(length(item_id) between 1 and 36),
 stage text not null check(stage in ('manager','senior_manager','finance')),
 reviewer_id uuid not null references auth.users(id),
 reviewer_name text not null,
 state text not null check(state in ('checked','flagged')),
 note text not null default '' check(length(note)<=1000 and (state<>'flagged' or length(trim(note))>0)),
 updated_at timestamptz not null default now(),
 primary key(claim_id,item_id,stage,reviewer_id)
);
create index expense_item_reviews_reviewer_idx on public.expense_item_reviews(reviewer_id);
alter table public.expense_item_reviews enable row level security;
create policy expense_item_reviews_read on public.expense_item_reviews for select to authenticated
 using(exists(select 1 from public.expense_claims c where c.id=claim_id));
revoke all on public.expense_item_reviews from public,anon,authenticated;
grant select on public.expense_item_reviews to authenticated;

create function expense_private.save_item_review(claim_id_arg uuid,item_id_arg text,stage_arg text,state_arg text,note_arg text default '')
returns setof public.expense_item_reviews language plpgsql security definer set search_path='' as $$
declare claim_row public.expense_claims%rowtype;actor uuid:=auth.uid();actor_role text;actor_name text;allowed boolean;
begin
 if actor is null then raise exception 'Sign in first.' using errcode='42501';end if;
 select * into claim_row from public.expense_claims where id=claim_id_arg for update;
 if not found then raise exception 'Claim not available.' using errcode='42501';end if;
 actor_role:=expense_private.member_role(claim_row.company_id);
 if actor_role is null or (actor_role<>'admin' and actor_role is distinct from stage_arg) then raise exception 'You cannot check items at this review stage.' using errcode='42501';end if;
 allowed:=case stage_arg
 when 'manager' then claim_row.first_review_role='manager' and claim_row.status='submitted'
 when 'senior_manager' then claim_row.first_review_role='senior_manager' and claim_row.status in ('submitted','manager_approved')
 when 'finance' then (claim_row.first_review_role='manager' and claim_row.status='manager_approved') or (claim_row.first_review_role='senior_manager' and claim_row.status='senior_approved')
 else false end;
 if not allowed then raise exception 'This review stage is closed. Refresh the claim.' using errcode='42501';end if;
 if not exists(select 1 from jsonb_array_elements(claim_row.payload->'receipts') item where item->>'id'=item_id_arg) then raise exception 'Item not found in this claim.' using errcode='22023';end if;
 if coalesce(state_arg,'') not in ('pending','checked','flagged') or note_arg is null or length(note_arg)>1000 or (state_arg='flagged' and length(trim(note_arg))=0) then raise exception 'Enter a reason when flagging an item (up to 1000 characters).' using errcode='22023';end if;
 if state_arg='pending' then
  delete from public.expense_item_reviews where claim_id=claim_id_arg and item_id=item_id_arg and stage=stage_arg and reviewer_id=actor;
  return;
 end if;
 select display_name into actor_name from public.expense_members where company_id=claim_row.company_id and user_id=actor;
 return query insert into public.expense_item_reviews as r(claim_id,item_id,stage,reviewer_id,reviewer_name,state,note,updated_at)
 values(claim_id_arg,item_id_arg,stage_arg,actor,actor_name,state_arg,trim(note_arg),now())
 on conflict(claim_id,item_id,stage,reviewer_id) do update set state=excluded.state,note=excluded.note,reviewer_name=excluded.reviewer_name,updated_at=excluded.updated_at
 returning r.*;
end $$;
revoke all on function expense_private.save_item_review(uuid,text,text,text,text) from public,anon;
grant execute on function expense_private.save_item_review(uuid,text,text,text,text) to authenticated;
create function public.expense_save_item_review(claim_id_arg uuid,item_id_arg text,stage_arg text,state_arg text,note_arg text default '')
returns setof public.expense_item_reviews language sql security invoker set search_path='' as $$
 select * from expense_private.save_item_review(claim_id_arg,item_id_arg,stage_arg,state_arg,note_arg)
$$;
revoke all on function public.expense_save_item_review(uuid,text,text,text,text) from public,anon;
grant execute on function public.expense_save_item_review(uuid,text,text,text,text) to authenticated;

create function expense_private.require_item_checks(claim_id_arg uuid,stage_arg text,actor_arg uuid) returns void
language plpgsql security invoker set search_path='' as $$
declare claim_payload jsonb;
begin
 if auth.uid() is null or actor_arg is distinct from auth.uid() then raise exception 'Sign in first.' using errcode='42501';end if;
 select payload into claim_payload from public.expense_claims where id=claim_id_arg;
 if claim_payload is null or exists(
  select 1 from jsonb_array_elements(claim_payload->'receipts') item where not exists(
   select 1 from public.expense_item_reviews r where r.claim_id=claim_id_arg and r.item_id=item->>'id'
   and r.stage=stage_arg and r.reviewer_id=actor_arg and r.state='checked'
  )
 ) then raise exception 'Check every item yourself at this approval stage before approving the claim.';end if;
end $$;
revoke all on function expense_private.require_item_checks(uuid,text,uuid) from public,anon;
grant execute on function expense_private.require_item_checks(uuid,text,uuid) to authenticated;

create or replace function expense_private.guard_claim() returns trigger language plpgsql security invoker set search_path='' as $$
declare t jsonb;actor uuid:=auth.uid();member text;
begin
 if actor is null then raise exception 'Sign in first.';end if;
 member:=expense_private.member_role(new.company_id);if member is null then raise exception 'No company access.';end if;
 if tg_op='INSERT' then
  if new.owner_id<>actor or new.status<>'draft' then raise exception 'New claims must be your own drafts.';end if;
  new.created_at:=now();new.submitted_at:=null;new.reviewed_at:=null;new.reviewed_by:=null;new.paid_at:=null;new.manager_approved_at:=null;new.manager_approved_by:=null;new.senior_approved_at:=null;new.senior_approved_by:=null;new.first_review_role:=case when member='manager' then 'senior_manager' else 'manager' end;new.review_note:='';
 else
  if (new.id,new.company_id,new.owner_id,new.reference,new.created_at) is distinct from (old.id,old.company_id,old.owner_id,old.reference,old.created_at) then raise exception 'Claim identity cannot change.';end if;
  if new.payload is distinct from old.payload and not(old.status='draft' and actor=old.owner_id) then raise exception 'Submitted claims are immutable. Correct and resubmit a new version.';end if;
  new.submitted_at:=old.submitted_at;new.reviewed_at:=old.reviewed_at;new.reviewed_by:=old.reviewed_by;new.paid_at:=old.paid_at;new.manager_approved_at:=old.manager_approved_at;new.manager_approved_by:=old.manager_approved_by;new.senior_approved_at:=old.senior_approved_at;new.senior_approved_by:=old.senior_approved_by;new.first_review_role:=old.first_review_role;
  if old.status='draft' and actor=old.owner_id and new.status in ('draft','submitted') then
   new.first_review_role:=case when member='manager' then 'senior_manager' else 'manager' end;
   new.review_note:='';if new.status='submitted' then new.submitted_at:=now();end if;
  elsif member in ('admin','manager') and old.first_review_role='manager' and old.status='submitted' and new.status in ('manager_approved','returned') then
   if new.status='returned' and length(trim(new.review_note))=0 then raise exception 'Explain why the claim is being returned.';end if;
   if new.status='manager_approved' then new.manager_approved_at:=now();new.manager_approved_by:=actor;end if;
  elsif member in ('admin','senior_manager') and old.first_review_role='senior_manager' and old.status in ('submitted','manager_approved') and new.status in ('senior_approved','returned') then
   if new.status='returned' and length(trim(new.review_note))=0 then raise exception 'Explain why the claim is being returned.';end if;
   if new.status='senior_approved' then new.senior_approved_at:=now();new.senior_approved_by:=actor;end if;
  elsif member in ('admin','finance') and ((((old.first_review_role='manager' and old.status='manager_approved') or (old.first_review_role='senior_manager' and old.status='senior_approved')) and new.status in ('approved','returned')) or(old.status='approved' and new.status='paid')) then
   if new.status='returned' and length(trim(new.review_note))=0 then raise exception 'Explain why the claim is being returned.';end if;
   new.reviewed_at:=now();new.reviewed_by:=actor;if new.status='paid' then new.paid_at:=now();end if;
  else raise exception 'That claim status change is not allowed.';end if;
 end if;
 if new.reference is distinct from new.payload->>'reference' or new.payment_type is distinct from new.payload->>'paymentType'
  or new.engineer is distinct from new.payload->>'engineer' or new.claim_date::text is distinct from new.payload->>'claimDate' then raise exception 'Claim fields do not match its details.';end if;
 if tg_op='UPDATE' and new.status is distinct from old.status then
  if new.status='manager_approved' then perform expense_private.require_item_checks(old.id,'manager',actor);
  elsif new.status='senior_approved' then perform expense_private.require_item_checks(old.id,'senior_manager',actor);
  elsif new.status='approved' then perform expense_private.require_item_checks(old.id,'finance',actor);
  end if;
 end if;
 t:=expense_private.claim_totals(new.payload,new.company_id,new.owner_id,new.id,new.status<>'draft');
 new.receipt_net:=(t->>'net')::bigint;new.receipt_vat:=(t->>'vat')::bigint;new.receipt_gross:=(t->>'gross')::bigint;
 new.mileage_amount:=(t->>'mileage')::bigint;new.mileage_miles:=(t->>'miles')::numeric;new.mileage_pending:=(t->>'pending')::boolean;
 new.total_pence:=(t->>'total')::bigint;new.owed_pence:=(t->>'owed')::bigint;new.updated_at:=now();return new;
end $$;

