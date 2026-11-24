-- Additive upgrade: preserve every existing claim and its history.
alter table public.expense_members drop constraint expense_members_role_check;
alter table public.expense_members add constraint expense_members_role_check check(role in ('engineer','manager','finance','admin'));
alter table public.expense_members add column password_change_required boolean not null default false;
alter table public.expense_claims drop constraint expense_claims_status_check;
alter table public.expense_claims add constraint expense_claims_status_check check(status in ('draft','submitted','manager_approved','returned','approved','paid'));
alter table public.expense_claims add column manager_approved_at timestamptz;
alter table public.expense_claims add column manager_approved_by uuid references auth.users(id);
create index expense_claims_manager_approved_by_idx on public.expense_claims(manager_approved_by);

create or replace function expense_private.member_role(company uuid) returns text
language sql stable security definer set search_path='' as $$
 select m.role from public.expense_members m where auth.uid() is not null
 and m.company_id=company and m.user_id=auth.uid() and not m.password_change_required
$$;

-- Auth is responsible for verifying and changing passwords. User-editable metadata
-- cannot clear this flag; only a changed Auth password hash unlocks a new account.
create function expense_private.password_changed() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.encrypted_password is distinct from old.encrypted_password and coalesce(new.encrypted_password,'')<>'' then
  update public.expense_members set password_change_required=false where user_id=new.id and password_change_required;
 end if;return new;
end $$;
revoke all on function expense_private.password_changed() from public,anon,authenticated;
create trigger expense_password_changed after update of encrypted_password on auth.users
 for each row execute function expense_private.password_changed();

alter policy expense_member_read on public.expense_members using(user_id=(select auth.uid()) or expense_private.member_role(company_id) in ('admin','finance','manager'));
alter policy expense_claim_read on public.expense_claims using(
 expense_private.member_role(company_id) is not null and (
 owner_id=(select auth.uid()) or (status<>'draft' and expense_private.member_role(company_id) in ('admin','manager'))
 or (expense_private.member_role(company_id)='finance' and (manager_approved_at is not null or status in ('approved','paid'))))
);
alter policy expense_claim_update on public.expense_claims using(
 expense_private.member_role(company_id) is not null and (
 owner_id=(select auth.uid()) or (status<>'draft' and expense_private.member_role(company_id) in ('admin','manager'))
 or (expense_private.member_role(company_id)='finance' and (manager_approved_at is not null or status in ('approved','paid'))))
) with check(
 expense_private.member_role(company_id) is not null and (
 owner_id=(select auth.uid()) or (status<>'draft' and expense_private.member_role(company_id) in ('admin','manager'))
 or (expense_private.member_role(company_id)='finance' and (manager_approved_at is not null or status in ('approved','paid'))))
);
grant select,insert on public.expense_members to service_role;
create or replace function expense_private.guard_claim() returns trigger language plpgsql security invoker set search_path='' as $$
declare t jsonb;actor uuid:=auth.uid();member text;
begin
 if actor is null then raise exception 'Sign in first.';end if;
 member:=expense_private.member_role(new.company_id);if member is null then raise exception 'No company access.';end if;
 if tg_op='INSERT' then
  if new.owner_id<>actor or new.status<>'draft' then raise exception 'New claims must be your own drafts.';end if;
  new.created_at:=now();new.submitted_at:=null;new.reviewed_at:=null;new.reviewed_by:=null;new.paid_at:=null;new.manager_approved_at:=null;new.manager_approved_by:=null;new.review_note:='';
 else
  if (new.id,new.company_id,new.owner_id,new.reference,new.created_at) is distinct from (old.id,old.company_id,old.owner_id,old.reference,old.created_at) then raise exception 'Claim identity cannot change.';end if;
  if new.payload is distinct from old.payload and not(old.status='draft' and actor=old.owner_id) then raise exception 'Submitted claims are immutable. Correct and resubmit a new version.';end if;
  new.submitted_at:=old.submitted_at;new.reviewed_at:=old.reviewed_at;new.reviewed_by:=old.reviewed_by;new.paid_at:=old.paid_at;new.manager_approved_at:=old.manager_approved_at;new.manager_approved_by:=old.manager_approved_by;
  if old.status='draft' and actor=old.owner_id and new.status in ('draft','submitted') then
   new.review_note:='';if new.status='submitted' then new.submitted_at:=now();end if;
  elsif member in ('admin','manager') and old.status='submitted' and new.status in ('manager_approved','returned') then
   if new.status='returned' and length(trim(new.review_note))=0 then raise exception 'Explain why the claim is being returned.';end if;
   if new.status='manager_approved' then new.manager_approved_at:=now();new.manager_approved_by:=actor;end if;
  elsif member in ('admin','finance') and ((old.status='manager_approved' and new.status in ('approved','returned')) or(old.status='approved' and new.status='paid')) then
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
