-- Tout nouveau compte est INACTIF : aucun accès tant que l'administrateur ne l'a pas activé
-- (protection même si l'inscription publique était laissée ouverte).
alter table public.participants alter column active set default false;
create or replace function public.tg_handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.participants (user_id, display_name, active)
  values (new.id, left(coalesce(nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''),
                                split_part(new.email, '@', 1), 'Participant'), 80), false)
  on conflict (user_id) do nothing;
  return new;
end $$;
revoke execute on function public.tg_handle_new_user() from public, anon, authenticated;
