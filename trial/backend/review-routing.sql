-- Parallel first-review routes; no additional senior stage for ordinary team claims.
alter table public.expense_members drop constraint expense_members_role_check;
alter table public.expense_members add constraint expense_members_role_check check(role in ('engineer','manager','senior_manager','finance','admin'));
alter table public.expense_claims drop constraint expense_claims_status_check;
alter table public.expense_claims add constraint expense_claims_status_check check(status in ('draft','submitted','manager_approved','senior_approved','returned','approved','paid'));
alter table public.expense_claims add column first_review_role text not null default 'manager' check(first_review_role in ('manager','senior_manager'));
alter table public.expense_claims add column senior_approved_at timestamptz;
alter table public.expense_claims add column senior_approved_by uuid references auth.users(id);
create index expense_claims_senior_approved_by_idx on public.expense_claims(senior_approved_by);
-- Correct pending manager-owned claims without rewriting their status, financial
-- data, signatures, photographs, previous approvals or audit events. Migration is atomic.
alter table public.expense_claims disable trigger expense_guard;
alter table public.expense_claims disable trigger expense_audit;
update public.expense_claims c set first_review_role='senior_manager'
from public.expense_members m where m.company_id=c.company_id and m.user_id=c.owner_id
and m.role='manager' and c.status in ('draft','submitted','manager_approved');
alter table public.expense_claims enable trigger expense_guard;
alter table public.expense_claims enable trigger expense_audit;
alter policy expense_member_read on public.expense_members using(user_id=(select auth.uid()) or expense_private.member_role(company_id) in ('admin','finance','manager','senior_manager'));
alter policy expense_claim_read on public.expense_claims using(expense_private.member_role(company_id) is not null and (
 owner_id=(select auth.uid()) or (status<>'draft' and (
 expense_private.member_role(company_id)='admin'
 or (expense_private.member_role(company_id)='manager' and first_review_role='manager')
 or (expense_private.member_role(company_id)='senior_manager' and first_review_role='senior_manager')
 or (expense_private.member_role(company_id)='finance' and (
 (first_review_role='manager' and manager_approved_at is not null)
 or (first_review_role='senior_manager' and senior_approved_at is not null)
 or status in ('approved','paid') or (status='returned' and reviewed_by is not null)
 ))))));
alter policy expense_claim_update on public.expense_claims using(expense_private.member_role(company_id) is not null and (
 owner_id=(select auth.uid()) or (status<>'draft' and (
 expense_private.member_role(company_id)='admin'
 or (expense_private.member_role(company_id)='manager' and first_review_role='manager')
 or (expense_private.member_role(company_id)='senior_manager' and first_review_role='senior_manager')
 or (expense_private.member_role(company_id)='finance' and (
 (first_review_role='manager' and manager_approved_at is not null)
 or (first_review_role='senior_manager' and senior_approved_at is not null)
 or status in ('approved','paid') or (status='returned' and reviewed_by is not null)
 )))))) with check(expense_private.member_role(company_id) is not null and (
 owner_id=(select auth.uid()) or (status<>'draft' and (
 expense_private.member_role(company_id)='admin'
 or (expense_private.member_role(company_id)='manager' and first_review_role='manager')
 or (expense_private.member_role(company_id)='senior_manager' and first_review_role='senior_manager')
 or (expense_private.member_role(company_id)='finance' and (
 (first_review_role='manager' and manager_approved_at is not null)
 or (first_review_role='senior_manager' and senior_approved_at is not null)
 or status in ('approved','paid') or (status='returned' and reviewed_by is not null)
 ))))));
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
 t:=expense_private.claim_totals(new.payload,new.company_id,new.owner_id,new.id,new.status<>'draft');
 new.receipt_net:=(t->>'net')::bigint;new.receipt_vat:=(t->>'vat')::bigint;new.receipt_gross:=(t->>'gross')::bigint;
 new.mileage_amount:=(t->>'mileage')::bigint;new.mileage_miles:=(t->>'miles')::numeric;new.mileage_pending:=(t->>'pending')::boolean;
 new.total_pence:=(t->>'total')::bigint;new.owed_pence:=(t->>'owed')::bigint;new.updated_at:=now();return new;
end $$;

-- Only this guarded RPC can change roles from the app. Keep table updates denied.
create or replace function expense_private.set_member_role(company_id_arg uuid,target_user_id uuid,expected_role text,new_role text)
returns table(user_id uuid,role text)
language plpgsql security definer set search_path='' as $$
declare member_role_before text;actor uuid:=auth.uid();
begin
 if actor is null or expense_private.member_role(company_id_arg) is distinct from 'admin' then
  raise exception 'Administrator access required.' using errcode='42501';
 end if;
 if coalesce(new_role,'') not in ('engineer','manager','senior_manager','finance') or coalesce(expected_role,'') not in ('engineer','manager','senior_manager','finance') then
  raise exception 'Choose Engineer, Manager, Senior management or Accounts.' using errcode='22023';
 end if;
 select m.role into member_role_before from public.expense_members m
 where m.company_id=company_id_arg and m.user_id=target_user_id for update;
 if not found then raise exception 'Person not found in your team.' using errcode='42501';end if;
 if actor=target_user_id or member_role_before='admin' then raise exception 'Administrator access cannot be changed here.' using errcode='42501';end if;
 if member_role_before is distinct from expected_role then raise exception 'Their access has changed. Refresh the people list and try again.' using errcode='40001';end if;
 return query update public.expense_members m set role=new_role
 where m.company_id=company_id_arg and m.user_id=target_user_id returning m.user_id,m.role;
end $$;
revoke all on function expense_private.set_member_role(uuid,uuid,text,text) from public,anon;
grant execute on function expense_private.set_member_role(uuid,uuid,text,text) to authenticated;

create or replace function public.expense_set_member_role(company_id_arg uuid,target_user_id uuid,expected_role text,new_role text)
returns table(user_id uuid,role text)
language sql security invoker set search_path='' as $$
 select * from expense_private.set_member_role(company_id_arg,target_user_id,expected_role,new_role)
$$;
revoke all on function public.expense_set_member_role(uuid,uuid,text,text) from public,anon;
grant execute on function public.expense_set_member_role(uuid,uuid,text,text) to authenticated;