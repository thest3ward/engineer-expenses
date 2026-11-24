-- Only this guarded RPC can change roles from the app. Keep table updates denied.
create or replace function expense_private.set_member_role(company_id_arg uuid,target_user_id uuid,expected_role text,new_role text)
returns table(user_id uuid,role text)
language plpgsql security definer set search_path='' as $$
declare member_role_before text;actor uuid:=auth.uid();
begin
 if actor is null or expense_private.member_role(company_id_arg) is distinct from 'admin' then
  raise exception 'Administrator access required.' using errcode='42501';
 end if;
 if coalesce(new_role,'') not in ('engineer','manager','finance') or coalesce(expected_role,'') not in ('engineer','manager','finance') then
  raise exception 'Choose Engineer, Manager or Accounts.' using errcode='22023';
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